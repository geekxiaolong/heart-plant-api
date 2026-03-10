# Real auth validation notes (2026-03-10)

## Verified
- `.env.local` exists locally and is ignored by Git via `.gitignore` (`.env`, `.env.local`, `.env.*`, except `.env.example`).
- Supabase service role key is configured locally, so auth admin, KV table access, and storage bucket listing all work from the backend environment.
- Supabase Auth contains a real admin-capable user:
  - email: `776427024@qq.com`
  - `user_metadata.role = admin`
  - email confirmed
  - recent `last_sign_in_at` present
- KV table `kv_store_4b732228` is reachable and populated.
- Storage buckets are reachable and present, including snapshot-related buckets.
- Existing data tied to the admin email is present in KV (`plant:*`, `stats:*`, etc.), so authenticated/admin views should have meaningful data once a valid user JWT is supplied.

## Backend auth behavior confirmed from code
- Frontend/admin login is done through Supabase Auth in the browser (`signInWithPassword`).
- Backend user resolution checks, in order:
  - `X-User-JWT`
  - `Authorization: Bearer <token>`
- Backend rejects anon key / service role key as user tokens.
- Admin authorization is granted when either:
  - `user_metadata.role === "admin"`
  - or email is `776427024@qq.com`
- `/plants?admin_view=true` is the route actually used by admin UI for adopted plant views.

## Confirmed backend gaps vs frontend/admin expectations
### Missing or mismatched endpoints
- Admin/frontend expect `DELETE /library/:id`, but backend only has:
  - `GET /library`
  - `POST /library`
- Admin/frontend expect image helper endpoints:
  - `POST /upload-url`
  - `GET /image-url/:path`
  but backend only exposes `POST /upload-snapshot`
- Admin/frontend expect journal moderation endpoints:
  - `POST /journal-feature/:id`
  - `DELETE /journal/:id`
  but backend only exposes journal create/list/detail reads
- Frontend references follow endpoints:
  - `/follow/:userId`
  - `/is-following/:userId`
  but backend does not expose matching route definitions
- Some admin pages use `/plants?admin_view=true`; this is supported, but only with a real authenticated admin JWT.

### Security / behavior issues
- `POST /library` currently has no auth/admin guard in backend code.
  - That means any caller reaching the function can write library items.
- `admin.delete("/plants/:id")` looks up `kv.get("plant:${id}")`, but stored adopted plant keys are already full keys like `plant:p1-...`.
  - If caller passes the full stored id, lookup becomes `plant:plant:p1-...` and deletion will miss.
  - This route likely does not delete existing adopted plant records correctly.

## What could not be fully runtime-verified here
- I did not recover or persist a live browser access token.
- Local HTTP checks against `http://127.0.0.1:8000` returned `502 Bad Gateway` in this tool environment even while the Deno process reported `Listening on http://0.0.0.0:8000/`.
- Because of that tool-network quirk and lack of a reusable live JWT in hand, I could not directly execute `/profile`, `/plants?admin_view=true`, or `/admin/*` with a real end-user bearer token from this session.

## Recommended next actions
1. Use an actual browser/admin login on this machine and capture one fresh access token only for temporary verification.
2. Hit these first with that token:
   - `GET /profile`
   - `GET /plants?admin_view=true`
   - `GET /admin/stats/overview`
   - `GET /admin/users`
3. Implement/fix the missing backend endpoints used by admin UI:
   - `DELETE /library/:id` ✅ implemented 2026-03-10
   - `POST /upload-url` ✅ implemented 2026-03-10
   - `GET /image-url/:path` ✅ implemented 2026-03-10
   - `POST /journal-feature/:id` ✅ implemented 2026-03-10
   - `DELETE /journal/:id` ✅ implemented 2026-03-10
   - follow-related routes if still needed by frontend
4. Add auth/admin guard to `POST /library`. ✅ implemented 2026-03-10
5. Fix admin plant deletion key handling. ✅ implemented 2026-03-10
