"""Offline smoke test for the app-data API.

Runs the whole hand-off and isolation flow against an in-memory table, so it
needs no AWS credentials and never touches production:

    python3 backend/tests/app_data_smoke.py
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys

os.environ.setdefault("AWS_DEFAULT_REGION", "ap-southeast-2")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("OTP_HASH_SECRET", "x" * 40)

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import main as api  # noqa: E402
from app.repository import DynamoAccountRepository  # noqa: E402
from app.security import hash_password  # noqa: E402


class ConditionalCheckFailed(Exception):
    pass


class ReservedWord(Exception):
    """Stands in for DynamoDB rejecting a reserved keyword in an expression."""


RESERVED = {"ttl", "name", "status", "data", "size", "value", "type", "state"}


class FakeClient:
    class exceptions:
        ConditionalCheckFailedException = ConditionalCheckFailed
        TransactionCanceledException = type("TransactionCanceledException", (Exception,), {})
        TransactionConflictException = type("TransactionConflictException", (Exception,), {})
        ProvisionedThroughputExceededException = type("ProvisionedThroughputExceededException", (Exception,), {})

    def describe_table(self, TableName):  # noqa: N803
        return {
            "TableName": TableName,
            "TableStatus": "ACTIVE",
            "BillingModeSummary": {"BillingMode": "PROVISIONED"},
            "ProvisionedThroughput": {"ReadCapacityUnits": 25, "WriteCapacityUnits": 25},
        }

    meta = type("Meta", (), {"region_name": "ap-southeast-2"})()

    def transact_write_items(self, TransactItems):  # noqa: N803
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}


class FakeTable:
    name = "UnifiedAppTable"

    def __init__(self):
        self.items = {}
        self.meta = type("Meta", (), {"client": FakeClient()})()

    def _key(self, key):
        return (key["PK"], key["SK"])

    def get_item(self, Key, ConsistentRead=False):  # noqa: N803
        item = self.items.get(self._key(Key))
        return {"Item": dict(item)} if item else {}

    def put_item(self, Item):
        self.items[self._key(Item)] = dict(Item)

    def query(self, KeyConditionExpression, ExpressionAttributeValues, ConsistentRead=False, Limit=None, ScanIndexForward=True, Select=None):  # noqa: N803
        pk = ExpressionAttributeValues[":pk"]
        prefix = None
        for name in (":session", ":prefix"):
            if name in ExpressionAttributeValues:
                prefix = ExpressionAttributeValues[name]
        rows = [dict(item) for (item_pk, sk), item in self.items.items() if item_pk == pk]
        if prefix:
            rows = [row for row in rows if str(row["SK"]).startswith(prefix)]
        rows.sort(key=lambda row: str(row["SK"]), reverse=not ScanIndexForward)
        if Limit:
            rows = rows[: int(Limit)]
        if Select == "COUNT":
            return {"Items": [], "Count": len(rows)}
        return {"Items": rows, "Count": len(rows)}

    def delete_item(self, Key, ConditionExpression=None, ExpressionAttributeValues=None, ExpressionAttributeNames=None):  # noqa: N803
        existing = self.items.get(self._key(Key))
        if ConditionExpression and not existing:
            raise ConditionalCheckFailed()
        if ConditionExpression and ExpressionAttributeValues:
            if ":session_id" in ExpressionAttributeValues:
                if existing.get("session_id") != ExpressionAttributeValues[":session_id"]:
                    raise ConditionalCheckFailed()
            if ":now" in ExpressionAttributeValues:
                if int(existing.get("ttl", 0)) <= ExpressionAttributeValues[":now"]:
                    raise ConditionalCheckFailed()
        self.items.pop(self._key(Key), None)

    def update_item(self, Key, UpdateExpression, ConditionExpression=None, ExpressionAttributeValues=None, ExpressionAttributeNames=None):  # noqa: N803
        aliases = set((ExpressionAttributeNames or {}).values())
        for expression in (UpdateExpression or "", ConditionExpression or ""):
            for word in RESERVED - aliases:
                if f" {word} " in f" {expression} ":
                    raise ReservedWord(f"reserved keyword used without an alias: {word}")
        item = self.items.get(self._key(Key))
        if not item:
            raise ConditionalCheckFailed()
        if ConditionExpression and ExpressionAttributeValues and ":digest" in ExpressionAttributeValues:
            if item.get("token_hash") != ExpressionAttributeValues[":digest"]:
                raise ConditionalCheckFailed()
        for name, value in (ExpressionAttributeValues or {}).items():
            if name in {":digest", ":now"}:
                continue
            field = name.lstrip(":")
            item[{"stamp": "last_used_at", "active": "last_active"}.get(field, field)] = value
        return {"Attributes": item}

    def scan(self, FilterExpression=None, ExpressionAttributeValues=None, ExclusiveStartKey=None):  # noqa: N803
        rows = [dict(item) for item in self.items.values()]
        if FilterExpression and ":kind" in (ExpressionAttributeValues or {}):
            kind = ExpressionAttributeValues[":kind"]
            rows = [row for row in rows if row.get("entity_type") == kind]
        return {"Items": rows}

    def batch_writer(self):
        table = self

        class Writer:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def delete_item(self, Key):  # noqa: N803
                table.items.pop(table._key(Key), None)

        return Writer()


def build_repo():
    table = FakeTable()
    return table, DynamoAccountRepository(
        table,
        session_days=30,
        session_max_active=10,
        session_activity_update_seconds=300,
        otp_max_attempts=5,
        otp_verification_seconds=900,
        app_token_days=30,
        app_code_seconds=60,
        app_history_limit=5,
        app_saved_limit=5,
        app_box_max_bytes=200 * 1024,
        app_max_sessions=2,
    )


def pkce(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


failures = []


def check(name, condition, extra=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {extra}")
        failures.append(name)


def main() -> int:
    table, repo = build_repo()
    api.repository = repo
    client = TestClient(api.app)

    user_id = "usr_test0001"
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": "PROFILE",
            "user_id": user_id,
            "eyemail_id": "tester@eyemail.in",
            "full_name": "Test User",
            "nickname": "Tester",
            "language": "kn",
            "secondary_email": "tester@example.com",
        }
    )
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": "AUTH#PASSWORD",
            "entity_type": "AUTH",
            "password_hash": hash_password("Str0ng!pass"),
        }
    )
    session_token = repo.create_bearer_session(user_id, "Chrome on Linux")
    user_headers = {"Authorization": f"Bearer {session_token}"}

    print("panel surface")
    r = client.get("/api/v1/me/apps", headers=user_headers)
    check("list apps 200", r.status_code == 200, r.text)
    apps = r.json()["apps"]
    check("four app boxes", len(apps) == 4, str([a["key"] for a in apps]))
    check("eyemail slot is present", any(a["key"] == "EYEMAIL" for a in apps))
    check("nothing connected yet", all(a["connected"] is False for a in apps))

    print("handoff")
    verifier = "a" * 50
    bad = client.post(
        "/api/v1/me/apps/EYEBROWSE/authorize",
        headers=user_headers,
        json={"redirect": "https://evil.example/steal", "code_challenge": pkce(verifier), "state": "s"},
    )
    check("unregistered redirect refused", bad.status_code == 400, bad.text)

    good = client.post(
        "/api/v1/me/apps/EYEBROWSE/authorize",
        headers=user_headers,
        json={"redirect": "indobrowse://auth", "code_challenge": pkce(verifier), "state": "state123"},
    )
    check("authorize 201", good.status_code == 201, good.text)
    redirect_url = good.json()["redirect_url"]
    check("redirect carries state", "state=state123" in redirect_url, redirect_url)
    code = redirect_url.split("code=")[1].split("&")[0]

    wrong = client.post(
        "/api/v1/app/session",
        json={"app": "EYEBROWSE", "code": code, "code_verifier": "b" * 50, "device": "Pixel"},
    )
    check("wrong PKCE verifier refused", wrong.status_code == 400, wrong.text)

    check("code burned after a failed attempt", client.post(
        "/api/v1/app/session",
        json={"app": "EYEBROWSE", "code": code, "code_verifier": verifier, "device": "Pixel"},
    ).status_code == 400)

    fresh = client.post(
        "/api/v1/me/apps/EYEBROWSE/authorize",
        headers=user_headers,
        json={"redirect": "indobrowse://auth", "code_challenge": pkce(verifier), "state": "state123"},
    )
    code = fresh.json()["redirect_url"].split("code=")[1].split("&")[0]

    exchanged = client.post(
        "/api/v1/app/session",
        json={"app": "EYEBROWSE", "code": code, "code_verifier": verifier, "device": "Pixel 7"},
    )
    check("exchange 201", exchanged.status_code == 201, exchanged.text)
    app_token = exchanged.json()["token"]
    check("token is app scoped", app_token.startswith("EYEBROWSE."), app_token[:20])
    identity = exchanged.json()["identity"]
    check("identity has five fields", sorted(identity) == ["full_name", "indo_id", "language", "nickname", "user_id"], str(identity))
    check("no email leaked", "secondary_email" not in identity and "tester@example.com" not in str(identity))

    replay = client.post(
        "/api/v1/app/session",
        json={"app": "EYEBROWSE", "code": code, "code_verifier": verifier, "device": "Pixel"},
    )
    check("code cannot be replayed", replay.status_code == 400, replay.text)

    app_headers = {"Authorization": f"Bearer {app_token}"}

    print("app surface")
    check("app me 200", client.get("/api/v1/app/me", headers=app_headers).status_code == 200)
    state = client.get("/api/v1/app/state", headers=app_headers).json()
    check("app is connected", state["connected"] is True, str(state))

    saved = client.post(
        "/api/v1/app/saved",
        headers=app_headers,
        json={"title": "ISRO", "url": "https://www.isro.gov.in/missions?token=SECRET#frag"},
    )
    check("saved created", saved.status_code == 201, saved.text)
    check("query string stripped", "SECRET" not in saved.json()["url"], saved.json()["url"])
    check("fragment stripped", "#" not in saved.json()["url"], saved.json()["url"])

    history = client.post(
        "/api/v1/app/history",
        headers=app_headers,
        json={"entries": [{"url": f"https://example.com/page{i}?q=secret", "title": f"Page {i}"} for i in range(8)]},
    )
    check("history accepted", history.status_code == 202, history.text)
    check("history trimmed to limit", history.json()["total"] == 5, history.text)
    listed = client.get("/api/v1/app/history", headers=app_headers).json()
    check("history has no query strings", all("?" not in item["path"] for item in listed["items"]), str(listed["items"][:1]))

    print("isolation")
    cross = client.get("/api/v1/app/saved", headers=app_headers, params={"app": "EYESEARCH"})
    check("naming another app in a query is ignored", cross.status_code == 200 and cross.json()["total"] == 1, cross.text)
    cross_path = client.get("/api/v1/app/EYESEARCH/state", headers=app_headers)
    check("no path exists that names another app", cross_path.status_code in {403, 404, 422}, cross_path.text)
    eyesearch_box = client.get("/api/v1/me/apps/EYESEARCH", headers=user_headers).json()
    check("Eyesearch box untouched by Eyebrowse", eyesearch_box["counts"]["saved"] == 0 and eyesearch_box["counts"]["history"] == 0, str(eyesearch_box["counts"]))
    panel_with_app_token = client.get("/api/v1/me/apps", headers=app_headers)
    check("app token rejected on panel door", panel_with_app_token.status_code in {401, 403}, panel_with_app_token.text)
    app_door_with_user_token = client.get("/api/v1/app/me", headers=user_headers)
    check("account session rejected on app door", app_door_with_user_token.status_code in {401, 403}, app_door_with_user_token.text)

    print("session activity throttle")
    repo.session_activity_update_seconds = 0
    for key in [key for key in table.items if key[1].startswith("SESSION#")]:
        table.items[key]["last_active_epoch"] = 0
    check("activity update survives DynamoDB reserved words", client.get("/api/v1/me", headers=user_headers).status_code == 200)
    repo.session_activity_update_seconds = 300

    print("pause and clear")
    paused = client.patch("/api/v1/me/apps/EYEBROWSE", headers=user_headers, json={"status": "Paused"})
    check("pause 200", paused.status_code == 200, paused.text)
    blocked = client.post("/api/v1/app/saved", headers=app_headers, json={"title": "x", "url": "https://example.com/x"})
    check("paused app cannot write", blocked.status_code == 403, blocked.text)
    check("paused app can still read", client.get("/api/v1/app/state", headers=app_headers).status_code == 200)

    box = client.get("/api/v1/me/apps/EYEBROWSE", headers=user_headers).json()
    check("panel sees the session", len(box["sessions"]) == 1, str(box["sessions"]))
    check("panel sees counts", box["counts"]["saved"] == 1 and box["counts"]["history"] == 5, str(box["counts"]))

    print("panel opened from an app token")
    own = client.get("/api/v1/me/apps/EYEBROWSE", headers=app_headers)
    check("app token opens its own panel", own.status_code == 200, own.text)
    other = client.get("/api/v1/me/apps/EYESEARCH", headers=app_headers)
    check("app token cannot open another panel", other.status_code == 403, other.text)
    listing = client.get("/api/v1/me/apps", headers=app_headers)
    check("app token cannot list all boxes", listing.status_code in {401, 403}, listing.text)
    account = client.get("/api/v1/me", headers=app_headers)
    check("app token still refused on the account route", account.status_code in {401, 403}, account.text)
    cleared_via_app = client.delete("/api/v1/me/apps/EYEBROWSE/history", headers=app_headers)
    check("app token can clear its own history", cleared_via_app.status_code == 200, cleared_via_app.text)
    paused_by_app = client.patch("/api/v1/me/apps/EYEBROWSE", headers=app_headers, json={"status": "Active"})
    check("app token can resume its own app", paused_by_app.status_code == 200, paused_by_app.text)
    still_other = client.patch("/api/v1/me/apps/EYESEARCH", headers=app_headers, json={"status": "Paused"})
    check("app token cannot pause another app", still_other.status_code == 403, still_other.text)


    cleared_history = client.delete("/api/v1/me/apps/EYEBROWSE/history", headers=user_headers)
    check("panel clears history", cleared_history.status_code == 200, cleared_history.text)
    check("history gone, saved kept", cleared_history.json()["history"] == 0, cleared_history.text)
    kept = client.get("/api/v1/me/apps/EYEBROWSE", headers=user_headers).json()
    check("saved items survive a history clear", kept["counts"]["saved"] == 1, str(kept["counts"]))

    exported = client.get("/api/v1/me/apps/EYEBROWSE/export", headers=user_headers)
    check("export 200", exported.status_code == 200, exported.text)
    check("export has no token hashes", "token_hash" not in exported.text)

    cleared = client.delete("/api/v1/me/apps/EYEBROWSE/data", headers=user_headers)
    check("clear 200", cleared.status_code == 200, cleared.text)
    check("history emptied", cleared.json()["counts"]["history"] == 0, cleared.text)
    check("saved emptied", cleared.json()["counts"]["saved"] == 0, cleared.text)

    revoked = client.delete("/api/v1/me/apps/EYEBROWSE/sessions", headers=user_headers)
    check("revoke 204", revoked.status_code == 204, revoked.text)
    after = client.get("/api/v1/app/state", headers=app_headers)
    check("revoked token stops working", after.status_code == 401, after.text)
    disconnected = client.get("/api/v1/me/apps/EYEBROWSE", headers=user_headers).json()
    check("box shows disconnected", disconnected["connected"] is False, str(disconnected["connected"]))

    print("password change revokes other sessions")
    second_token = repo.create_bearer_session(user_id, "Firefox on Linux")
    second_headers = {"Authorization": f"Bearer {second_token}"}
    app_token_again = client.post(
        "/api/v1/me/apps/EYEBROWSE/authorize",
        headers=user_headers,
        json={"redirect": "indobrowse://auth", "code_challenge": pkce(verifier), "state": "s2"},
    ).json()["redirect_url"].split("code=")[1].split("&")[0]
    fresh_app = client.post(
        "/api/v1/app/session",
        json={"app": "EYEBROWSE", "code": app_token_again, "code_verifier": verifier, "device": "Pixel"},
    ).json()["token"]
    changed = client.post(
        "/api/v1/me/password",
        headers=user_headers,
        json={"current_password": "Str0ng!pass", "new_password": "N3w!stronger"},
    )
    check("password change accepted or verification required", changed.status_code in {204, 400}, changed.text)
    if changed.status_code == 204:
        check("current session survives", client.get("/api/v1/me", headers=user_headers).status_code == 200)
        check("other browser session revoked", client.get("/api/v1/me", headers=second_headers).status_code == 401)
        check("app session revoked", client.get("/api/v1/app/me", headers={"Authorization": f"Bearer {fresh_app}"}).status_code == 401)

    print("panel session from an app token")
    fresh_code = client.post(
        "/api/v1/me/apps/EYEBROWSE/authorize",
        headers=user_headers,
        json={"redirect": "indobrowse://auth", "code_challenge": pkce(verifier), "state": "s3"},
    ).json()["redirect_url"].split("code=")[1].split("&")[0]
    live_app = client.post(
        "/api/v1/app/session",
        json={"app": "EYEBROWSE", "code": fresh_code, "code_verifier": verifier, "device": "Pixel"},
    ).json()["token"]
    panel = client.post(
        "/api/v1/app/panel-session",
        headers={"Authorization": f"Bearer {live_app}"},
        json={"device": "Pixel 7"},
    )
    check("panel session issued", panel.status_code == 201, panel.text)
    panel_token = panel.json()["panel_token"] if panel.status_code == 201 else ""
    check("panel session is short lived", panel.json().get("expires_in") == 900, str(panel.json())[:120])
    panel_headers = {"Authorization": f"Bearer {panel_token}"}
    check("panel token reaches the account door", client.get("/api/v1/me", headers=panel_headers).status_code == 200)
    check("panel token lists the app boxes", client.get("/api/v1/me/apps", headers=panel_headers).status_code == 200)
    check("panel token is not an app token", client.get("/api/v1/app/me", headers=panel_headers).status_code in {401, 403})

    print("notifications default to off")
    defaults = client.get("/api/v1/me", headers=user_headers).json()["notifications"]
    check("every notification is off by default", not any(defaults.values()), str(defaults))
    switched = client.patch(
        "/api/v1/me/state",
        headers=user_headers,
        json={"notifications": {"security": True, "signin": True, "account": False, "updates": False, "news": False}},
    )
    check("switching on is saved", switched.status_code == 200, switched.text)
    saved = switched.json()["notifications"]
    check("only what was switched on stays on", saved.get("security") is True and saved.get("signin") is True and saved.get("updates") is False, str(saved))

    print("security activity deletion")
    for index in range(4):
        repo.record_security_event(user_id, "test", f"Event {index}", "Created by the smoke test.")
    events = [item for key, item in table.items.items() if key[0] == f"USER#{user_id}" and key[1].startswith("EVENT#")]
    check("events recorded", len(events) >= 4, str(len(events)))
    victim = events[0]["id"]
    survivor = events[1]["id"]
    removed_one = client.request(
        "DELETE",
        "/api/v1/me/security-events",
        headers=user_headers,
        json={"ids": [victim]},
    )
    check("delete one event", removed_one.status_code == 200, removed_one.text)
    check("one removed", removed_one.json()["removed"] == 1, removed_one.text)
    left = [item for key, item in table.items.items() if key[0] == f"USER#{user_id}" and key[1].startswith("EVENT#")]
    check("deleted id is gone", all(item["id"] != victim for item in left))
    check("other events survive", any(item["id"] == survivor for item in left))
    check("nothing is written back", len(left) == len(events) - 1, f"{len(left)} vs {len(events) - 1}")
    state_after = client.get("/api/v1/me", headers=user_headers).json()
    check("gone from the account state", all(event["id"] != victim for event in state_after["security_events"]))
    cleared = client.request("DELETE", "/api/v1/me/security-events", headers=user_headers, json={})
    check("clear all works", cleared.status_code == 200, cleared.text)
    remaining = [key for key in table.items if key[0] == f"USER#{user_id}" and key[1].startswith("EVENT#")]
    check("table holds no events", not remaining, str(len(remaining)))

    print("history is one item per visit")
    app = "EYEBROWSE"
    repo.issue_app_token(user_id, app, "Pixel 7") if False else None
    before_items = len(table.items)
    repo.add_app_history(user_id, app, [{"url": "https://example.com/a", "title": "A", "visited_at": "2026-11-16T10:00:00Z"}])
    after_items = len(table.items)
    hist_keys = [key for key in table.items if key[1].startswith(f"HIST#{app}#")]
    check("one visit writes one item", after_items - before_items == 1, f"{after_items - before_items}")
    check("history item exists", len(hist_keys) == 1, str(hist_keys))
    box_item = table.items[(f"USER#{user_id}", f"APP#{app}#STATE")]
    blob = json.dumps(box_item.get("state", {}))
    check("box no longer carries history", "example.com/a" not in blob)

    repo.add_app_history(user_id, app, [{"url": "https://example.com/b", "title": "B", "visited_at": "2026-11-16T10:05:00Z"}])
    listed = repo.list_app_history(user_id, app, limit=1)
    check("newest first", listed["items"][0]["title"] == "B", str(listed["items"]))
    check("paging gives a cursor", listed["next_cursor"] is not None)
    second = repo.list_app_history(user_id, app, limit=1, cursor=listed["next_cursor"])
    check("second page continues", second["items"][0]["title"] == "A", str(second["items"]))
    check("count is the real total", repo._count_entries(user_id, "HIST", app) == 2)

    print("history trimming")
    repo.app_history_limit = 3
    for index in range(5):
        repo.add_app_history(user_id, app, [{"url": f"https://example.com/t{index}", "title": f"T{index}", "visited_at": f"2026-11-16T11:0{index}:00Z"}])
    kept = repo._count_entries(user_id, "HIST", app)
    check("history stops at the limit", kept == 3, str(kept))
    newest = repo.list_app_history(user_id, app, limit=5)["items"]
    check("the newest survive", newest[0]["title"] == "T4", str([item["title"] for item in newest]))
    repo.app_history_limit = 500

    print("saved items")
    first = repo.add_app_saved(user_id, app, "One", "https://example.com/one")
    repo.add_app_saved(user_id, app, "Two", "https://example.com/two")
    again = repo.add_app_saved(user_id, app, "One again", "https://example.com/one")
    saved = repo.list_app_saved(user_id, app, limit=10)["items"]
    check("same url is kept once", len([item for item in saved if item["url"] == "https://example.com/one"]) == 1, str([item["url"] for item in saved]))
    check("the newer copy wins", any(item["id"] == again["id"] for item in saved))
    repo.delete_app_saved(user_id, app, again["id"])
    remaining = repo.list_app_saved(user_id, app, limit=10)["items"]
    check("delete removes one item", all(item["id"] != again["id"] for item in remaining))
    check("the other stays", any(item["id"] == first["id"] or item["url"] == "https://example.com/two" for item in remaining))

    print("box payload still carries history")
    box = repo.get_app_box(user_id, app)
    check("box shows history", len(box["data"]["history"]) >= 1, str(len(box["data"]["history"])))
    check("box shows saved", len(box["data"]["saved"]) >= 1)
    check("counts match storage", box["counts"]["history"] == repo._count_entries(user_id, "HIST", app))

    print("clear history removes items")
    repo.clear_app_history(user_id, app)
    check("history items are gone", not [key for key in table.items if key[1].startswith(f"HIST#{app}#")])
    check("saved items stay", [key for key in table.items if key[1].startswith(f"SAVE#{app}#")])

    print("migration of old blobs")
    old_user = "usr_migrate0000000001"
    blob = {
        "PK": f"USER#{old_user}",
        "SK": f"APP#{app}#STATE",
        "entity_type": "APP_STATE",
        "state": {
            "name": "Eyebrowse",
            "status": "Active",
            "connected": True,
            "data": {
                "history": [{"id": "hs_old1", "title": "Old", "origin": "https://old.example", "path": "/", "visited_at": "2026-11-15T09:00:00Z", "visits": 1}],
                "saved": [{"id": "sv_old1", "title": "Old save", "url": "https://old.example", "added_at": "2026-11-15T09:00:00Z"}],
            },
        },
    }
    table.items[(blob["PK"], blob["SK"])] = blob
    dry = repo.migrate_app_boxes(dry_run=True)
    check("dry run reports the entries", dry["history"] == 1 and dry["saved"] == 1, str(dry))
    check("dry run writes nothing", not [key for key in table.items if key[1].startswith(f"HIST#{app}#") and key[0] == f"USER#{old_user}"])
    done = repo.migrate_app_boxes()
    check("migration moved the history", done["history"] == 1, str(done))
    moved = repo.list_app_history(old_user, app, limit=5)["items"]
    check("moved entry is readable", moved and moved[0]["title"] == "Old", str(moved))
    blob_after = table.items[(blob["PK"], blob["SK"])]["state"]["data"]
    check("blob is emptied", "history" not in blob_after and "saved" not in blob_after, str(blob_after))
    again = repo.migrate_app_boxes()
    check("running twice changes nothing", again["history"] == 0, str(again))

    print("eyemail is the only mail transport")
    import urllib.request as _urllib
    from app.emailer import EyemailSender
    sent = []

    class FakeResponse:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return b'{"status":"sent"}'

    def fake_urlopen(request, timeout=None):
        import json as _json
        sent.append({"url": request.full_url, "timeout": timeout, "method": request.get_method(),
                     "headers": dict(request.header_items()),
                     "body": _json.loads(request.data) if request.data else None})
        return FakeResponse()

    original = _urllib.urlopen
    _urllib.urlopen = fake_urlopen
    try:
        sender = EyemailSender("https://eyemail.example", secret="s3cret", timeout=6.0)
        sender.send_signup_otp("someone@gmail.com", "123456")
        check("otp uses the eyemail endpoint", sent[-1]["url"] == "https://eyemail.example/api/internal/send-mail", sent[-1]["url"])
        check("api key header is sent", sent[-1]["headers"].get("X-api-key") == "s3cret", str(sent[-1]["headers"]))
        check("otp body carries the code", "123456" in sent[-1]["body"]["body"])
        check("recipient and sender name travel", sent[-1]["body"]["to"] == "someone@gmail.com" and sent[-1]["body"]["sender_name"] == "Indoworkspace Security")
        sender.register_mailbox(user_id="usr_1", username="a", name="A", recovery_email="r@example.com")
        check("mailbox registration hits its own endpoint", sent[-1]["url"].endswith("/api/internal/register-mailbox"), sent[-1]["url"])
        check("mailbox payload matches eyemail", sent[-1]["body"] == {"uid": "usr_1", "username": "a", "name": "A", "recovery_email": "r@example.com"}, str(sent[-1]["body"]))
        sender.rename_mailbox("usr_1", "New Name")
        check("rename is a PATCH on the uid", sent[-1]["method"] == "PATCH" and sent[-1]["url"].endswith("/api/internal/register-mailbox/usr_1"), str(sent[-1]))
        check("rename sends only the name", sent[-1]["body"] == {"name": "New Name"}, str(sent[-1]["body"]))
        import urllib.error as _errors
        def missing(request, timeout=None):
            raise _errors.HTTPError(request.full_url, 404, "Not Found", {}, None)
        _urllib.urlopen = missing
        check("deleting a missing mailbox counts as done", sender.delete_mailbox("usr_gone") == {"status": "missing"})
    finally:
        _urllib.urlopen = original

    check("no SES sender is left in the module", not hasattr(__import__("app.emailer", fromlist=["x"]), "SesEmailSender"))

    print("cascade")
    repo.delete_account(user_id)
    left = [key for key in table.items if key[0] == f"USER#{user_id}"]
    check("account delete removes every app item", not left, str(left))

    print()
    if failures:
        print(f"{len(failures)} FAILED: {failures}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
