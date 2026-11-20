# App sync contract

For the Eyebrowse app. Everything here is under the existing app token: `Authorization: Bearer <app token>`,
the same token `/api/v1/app/session` and `/api/v1/app/me` already use. An account token gets `403`, an
unknown or expired one gets `401`.

Six types, each synced and switched on separately: `bookmarks`, `tabs`, `history`, `logins`,
`settings`, `pinned`.

Every type starts **switched off**. Any read or write for a type that is off answers
`403 {"detail": "Sync for <type> is switched off for this account."}` — including for the app, so the
switch is not only a client-side promise.

---

## 1. Turn a type on or off

```
PUT /api/v1/app/sync/{type}
{"enabled": true}

200 {"type": "bookmarks", "enabled": true, "count": 12, "last_update": "2026-11-20T09:31:00Z"}
```

Switching a type off **keeps the data**. Use the DELETE below to remove it.

## 2. Status, for the settings screen

```
GET /api/v1/app/sync/status

200 {"types": [
  {"type": "bookmarks", "enabled": true,  "count": 12, "last_update": "2026-11-20T09:31:00Z"},
  {"type": "tabs",      "enabled": false, "count": 0,  "last_update": null},
  ... all six, always in that order
]}
```

`count` is the number of records currently stored for that type, tombstones included.

## 3. Pull changes

```
GET /api/v1/app/sync/{type}?since={cursor}&limit=200

200 {
  "type": "bookmarks",
  "records": [
    {"id": "b1", "updated_at": "2026-11-20T09:30:00Z", "deleted": false, "payload": {...}},
    {"id": "b2", "updated_at": "2026-11-20T09:31:00Z", "deleted": true,  "payload": null}
  ],
  "cursor": "0000000176270000000012ab34cd",
  "has_more": false
}
```

- Omit `since` on a first sync; the server returns everything it has, oldest change first.
- Store `cursor` and send it back next time. It is opaque: a string, up to 64 characters.
- `limit` defaults to 200 and is capped at 500. When `has_more` is true, call again with the cursor
  you just received.
- A record appears **once** per response, in its current state, even if it changed several times
  since your cursor.
- `deleted: true` is a tombstone: remove it locally, and send tombstones of your own so the other
  device learns about the delete.

## 4. Push changes

```
POST /api/v1/app/sync/{type}
{"records": [
  {"id": "b1", "updated_at": "2026-11-20T09:35:00Z", "deleted": false, "payload": {...}}
]}

200 {
  "type": "bookmarks",
  "accepted": 1,
  "conflicts": [],
  "cursor": "0000000176270000000012ab34ce"
}
```

- `id` is yours: up to 128 characters, stable for the life of the record.
- `updated_at` is yours too, and it is the only thing that decides a conflict. Send ISO 8601 with a
  timezone (`2026-11-20T09:35:00Z`) — it is compared as a string, so keep one format.
- `payload` is opaque. Send a map, a string, anything. For `logins` it is encrypted on the phone and
  the server stores and returns it byte for byte; it is never parsed, never logged.
- **Conflict rule.** If the copy on the server has a later `updated_at` than yours, your write is
  refused, the server copy comes back in `conflicts` with the same shape as a record, and you keep
  both. Nothing is silently dropped.
- Limits: 200 records per request, 64 KiB per record, 1 MiB per request. Over that:
  `413 {"detail": "..."}`. Rate limited per account and per IP: `429` with `Retry-After`.

## 5. Delete the cloud copy of one type

```
DELETE /api/v1/app/sync/{type}

200 {"type": "bookmarks", "deleted": 12}
```

Removes every record and tombstone for that type. The on/off switch is left exactly as it was, so the
next push starts a fresh set. This is what "delete the cloud copy" on sign-out should call.

---

## What is stored, and what is not

Stored: `id`, `updated_at`, `deleted`, `payload`, and a server sequence used only to build cursors.

Not stored, not logged, not counted anywhere: the payload contents, the number of records a person
has, or anything about what a record is. The only aggregate that exists is the per-type `count` in
the status response, and it never leaves that response.

## What happens when an account is deleted

Everything goes: all six types, all records and tombstones, in the same sweep that removes the
account. There is no separate step for the app to call.
