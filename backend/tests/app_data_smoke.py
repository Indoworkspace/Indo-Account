"""Offline smoke test for the app-data API.

Runs the whole hand-off and isolation flow against an in-memory table, so it
needs no AWS credentials and never touches production:

    python3 backend/tests/app_data_smoke.py
"""

from __future__ import annotations

import base64
import hashlib
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

    def query(self, KeyConditionExpression, ExpressionAttributeValues, ConsistentRead=False):  # noqa: N803
        pk = ExpressionAttributeValues[":pk"]
        prefix = None
        for name, value in ExpressionAttributeValues.items():
            if name == ":session":
                prefix = value
        rows = [dict(item) for (item_pk, sk), item in self.items.items() if item_pk == pk]
        if prefix:
            rows = [row for row in rows if str(row["SK"]).startswith(prefix)]
        return {"Items": rows}

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
    check("three app boxes", len(apps) == 3, str([a["key"] for a in apps]))
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
