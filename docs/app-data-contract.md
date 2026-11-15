# Indo Account — App Data Contract

Status: draft for owner approval. Version 0.1. Date: 16 Nov 2026.

This document is the handshake between the Indo Account backend, the management
panel, and each Indo app (Sankalp, Eyesearch, Eyebrowse). Nothing is implemented
against it yet. Once approved it is the checklist the work is judged against.

---

## 1. Principles

1. The account is the only source of truth. Apps never copy profile fields into
   local storage; they read them live.
2. Each app owns exactly one data box. An app can never read or write another
   app's box, and this is enforced on the server, never trusted from the client.
3. One identity, one password, one place to manage everything. Apps do not build
   their own settings screens for account data.
4. Deleting the account deletes every app box with it.

## 2. App registry

Only these keys are accepted anywhere in the API. Anything else is a 404.

| Key | Display name | Box contents |
| --- | --- | --- |
| `SANKALPA` | Sankalp | history, saved, memory, preferences |
| `EYESEARCH` | Eyesearch Search Engine | history, saved, preferences |
| `EYEBROWSE` | Eyebrowse Browser | history, saved, preferences |

A key is never renamed, because it is part of the DynamoDB sort key
(`APP#<KEY>#STATE`) and of every issued token.

## 3. Two API surfaces

The panel and the apps get different surfaces. This is the core of the isolation.

| Surface | Path prefix | Authenticated by | Can touch |
| --- | --- | --- | --- |
| Panel (user session) | `/api/v1/me/apps...` | the user's normal bearer session | all three boxes |
| App (scoped token) | `/api/v1/app...` | an app-scoped token | its own box only |

An app-scoped token presented on `/api/v1/me/...` is rejected with `403`. A user
session presented on `/api/v1/app/...` is also rejected with `403`. There is no
path where an app token reaches another app's data.

## 4. Sign-in hand-off (first-party)

Eyebrowse is a first-party client, so there is no consent screen.

1. The app opens the account sign-in page in a Custom Tab:

   ```
   https://indoworkspace.github.io/Indo-Account/Sign%20in/index.html
     ?app=EYEBROWSE
     &redirect=indobrowse%3A%2F%2Fauth
     &state=<32 random bytes, base64url>
     &code_challenge=<BASE64URL(SHA256(verifier))>
     &code_challenge_method=S256
   ```

2. After a successful sign-in the account validates `app` against the registry
   and `redirect` against the registered scheme for that app, then redirects to:

   ```
   indobrowse://auth?code=<one-time code>&state=<echoed state>
   ```

3. While the user is signed in, the page asks the API for the code:

   ```
   POST /api/v1/me/apps/EYEBROWSE/authorize
   { "redirect": "indobrowse://auth",
     "code_challenge": "<BASE64URL(SHA256(verifier))>",
     "state": "<the state the app sent>" }
   ```

   Response `201`:

   ```json
   { "redirect_url": "indobrowse://auth?code=...&state=...",
     "expires_in": 60,
     "app": { "key": "EYEBROWSE", "name": "Eyebrowse Browser" } }
   ```

   A redirect that does not match the registered prefix for that app is refused
   with `400`, so a stolen sign-in link cannot be pointed at another host.

4. The app validates that `state` matches what it sent, then exchanges the code:

   ```
   POST /api/v1/app/session
   {
     "app": "EYEBROWSE",
     "code": "<one-time code>",
     "code_verifier": "<the PKCE verifier>"
   }
   ```

   Response `201`:

   ```json
   {
     "token": "<opaque app token>",
     "expires_in": 2592000,
     "app": { "key": "EYEBROWSE", "name": "Eyebrowse Browser" },
     "identity": {
       "user_id": "usr_...",
       "indo_id": "name@eyemail.in",
       "full_name": "...",
       "nickname": "...",
       "language": "kn"
     }
   }
   ```

Rules for the code: single use, 60-second lifetime, bound to the app key and to
the PKCE challenge, and hashed at rest. A replayed or expired code returns `400`.
The code is consumed by the first exchange attempt even when the PKCE verifier
is wrong, so a guessed verifier cannot be retried against a live code.

Rules for the token: opaque, 32 random bytes, stored only as a SHA-256 digest,
30-day lifetime, bound to one app key, listed as its own session so the panel can
revoke it alone.

`identity` carries exactly five fields and nothing else. No email, no mobile, no
date of birth, no address.

## 5. App-facing endpoints

All require `Authorization: Bearer <app token>`. All return `403` for a token
that does not match the app key in the path.

The app key comes from the token, never from the path. There is no URL an app
can call that names another app, so a mix-up is impossible rather than merely
refused.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/app/me` | current identity block (same five fields) |
| `GET` | `/api/v1/app/state` | this app's box: status, connected, counts, preferences |
| `PATCH` | `/api/v1/app/preferences` | merge preferences |
| `GET` | `/api/v1/app/saved?limit=50&cursor=...` | paginated saved items |
| `POST` | `/api/v1/app/saved` | add one saved item |
| `DELETE` | `/api/v1/app/saved/{id}` | remove one saved item |
| `GET` | `/api/v1/app/history?limit=50&cursor=...` | paginated history |
| `POST` | `/api/v1/app/history` | add up to 100 entries in one call |
| `DELETE` | `/api/v1/app/history` | clear history for this app only |
| `DELETE` | `/api/v1/app/data` | clear this app's whole box |
| `POST` | `/api/v1/app/logout` | revoke the presented token |

A paused app (`status: "Paused"`) gets `403` on every write endpoint, but may
still read, so it can show the user why nothing is syncing.

## 6. Panel-facing endpoints

All require the user's normal bearer session.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/me/apps` | all three boxes, summary only |
| `GET` | `/api/v1/me/apps/{app}` | one box in full, including sessions |
| `PATCH` | `/api/v1/me/apps/{app}` | `{"status": "Active" \| "Paused"}` |
| `DELETE` | `/api/v1/me/apps/{app}/sessions` | sign out this app only |
| `DELETE` | `/api/v1/me/apps/{app}/sessions/{session_id}` | sign out one device of this app |
| `DELETE` | `/api/v1/me/apps/{app}/data` | clear this app's whole box |
| `GET` | `/api/v1/me/apps/{app}/export` | JSON export of this box |

Disconnecting is `DELETE /api/v1/me/apps/{app}/sessions` plus
`{"connected": false}` recorded on the box; there is no separate endpoint.

## 7. Data shapes

App box, as returned to the panel:

```json
{
  "key": "EYEBROWSE",
  "name": "Eyebrowse Browser",
  "status": "Active",
  "connected": true,
  "connected_at": "2026-11-16T05:10:00Z",
  "last_used_at": "2026-11-16T05:12:00Z",
  "counts": { "history": 12, "saved": 3 },
  "preferences": { "search_engine": "duckduckgo", "theme": "system", "history_sync": false },
  "sessions": [
    {
      "session_id": "aps_7f3e9b21",
      "device": "Eyebrowse on Pixel 7",
      "created_at": "2026-11-16T05:10:00Z",
      "last_used_at": "2026-11-16T05:12:00Z"
    }
  ]
}
```

Saved item:

```json
{ "id": "sv_9a1c", "title": "ISRO", "url": "https://www.isro.gov.in/", "added_at": "2026-11-16T05:11:00Z" }
```

History entry:

```json
{ "id": "hs_4d2e", "title": "ISRO missions", "origin": "https://www.isro.gov.in", "path": "/missions", "visited_at": "2026-11-16T05:11:30Z", "visits": 1 }
```

`url`, `origin` and `path` never contain a query string or fragment. The server
strips both before storing, so a client that forgets cannot leak a token through
a URL.

Preferences, per app, closed set:

| App | Keys |
| --- | --- |
| `EYEBROWSE` | `search_engine`, `theme`, `history_sync`, `safe_browsing`, `homepage` |
| `EYESEARCH` | `safe_search`, `results_per_page`, `region` |
| `SANKALPA` | `assistant_language`, `memory_enabled` |

Unknown preference keys are dropped silently, not rejected.

## 8. Limits

| Limit | Value | Reason |
| --- | --- | --- |
| History entries per app | 500, oldest dropped first | item size |
| Saved items per app | 500 | item size |
| `title` | 300 characters | item size |
| `url` | 2000 characters | item size |
| `path` | 500 characters | item size |
| History batch | 100 entries per request | request size |
| Total box size | 200 KB | DynamoDB's 400 KB item limit, with headroom |
| App token requests | 120 per minute per token | abuse |
| App token writes | 30 per minute per token | abuse |
| Code lifetime | 60 seconds, single use | replay |

Over-limit writes return `413` with `{"detail": "..."}`. History beyond 500 is
trimmed rather than refused.

## 9. Errors

Existing conventions are kept: every error is `{"detail": "string"}`, and no
message ever reveals whether another account exists.

| Status | When |
| --- | --- |
| `400` | expired or replayed code, bad PKCE verifier, malformed body |
| `401` | missing, invalid or revoked token |
| `403` | token used on the wrong surface, wrong app key, or app paused |
| `404` | unknown app key, unknown item id |
| `413` | body or box over the limits above |
| `429` | rate limit, with `retry_after` |

## 10. Audit

Every one of these writes a security event through the existing
`record_security_event` path, visible in the account's activity:

- `app.connected` — an app obtained its first token
- `app.session_revoked` — one app signed out
- `app.disconnected` — all sessions of one app revoked
- `app.data_cleared` — a box was emptied
- `app.paused` / `app.resumed`

## 11. Storage

One item per app per user, as today:

```
PK = USER#<user_id>
SK = APP#<KEY>#STATE
```

New attributes: `connected_at`, `last_used_at`, `counts`, and the sessions are
kept as their own items (`SK = APP#<KEY>#SESSION#<id>`) so one app's session can
be revoked without touching another.

Account deletion already removes the whole `USER#<user_id>` partition, so every
app box and every app session goes with it. No new cascade code is needed.

## 12. Non-goals for this phase

- Third-party OAuth / OIDC and a consent screen.
- History or bookmark sync from Eyebrowse. Identity only, first.
- Any migration of existing localStorage data beyond what already syncs.
- Payments, GST, contacts — removed by the owner, not to be reintroduced.
- SMS OTP — deferred by the owner.
