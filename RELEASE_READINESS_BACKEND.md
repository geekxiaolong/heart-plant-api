# Backend release readiness checklist

_Date: 2026-03-10_

## Stable / closed in this round
- [x] `GET /profile` returns a consistent profile object.
- [x] `PUT /profile` supports profile updates with KV fallback when auth metadata update is unavailable.
- [x] Follow contract is restored:
  - `POST /follow`
  - `DELETE /follow/:userId`
  - `GET /is-following/:userId`
  - `GET /following`
- [x] Public profile / user moments lookup is restored:
  - `GET /public/profile/:userId`
  - `GET /profile/:userId`
  - `GET /moments/user/:userId`
- [x] Admin/library write paths now require authenticated admin users.
- [x] `DELETE /library/:id` is available for admin UI.
- [x] Journal moderation paths are available:
  - `POST /journal-feature/:id`
  - `DELETE /journal/:id`
  - `GET /journal/:id/detail` alias added
- [x] Upload helper paths are available:
  - `POST /upload-url`
  - `GET /image-url/:path`
- [x] Admin plant deletion accepts raw ids and fully-prefixed KV keys.
- [x] Startup/config path no longer silently treats missing service-role setup as fully writable.
- [x] Static check passes: `deno task check`.

## Residual low-priority risks
- [ ] Several list endpoints still mix response styles (some wrapped objects, some raw arrays). Current frontend usage is compatible, but future cleanup should standardize shapes.
- [ ] Profile/follow display data can still fall back to KV or moments-derived values if auth-admin lookup is unavailable; acceptable for now, but not a perfect source of truth.
- [ ] Upload helper endpoints depend on storage bucket availability and valid service-role configuration in the runtime environment.
- [ ] Mock library/bootstrap initialization is intentionally skipped when `SUPABASE_SERVICE_ROLE_KEY` is absent, which is safer, but local demos without real env may look sparse.

## Manual verification before backend release
1. Copy `.env.example` to `.env.local` and confirm real values exist for:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
2. Start locally:
   - `deno task serve:once`
3. Verify unauthenticated basics:
   - `GET /health`
   - `GET /library`
4. Verify authenticated user flow with a real user JWT:
   - `GET /profile`
   - `PUT /profile`
   - `GET /moments/user/:userId`
   - follow/unfollow cycle
5. Verify authenticated admin flow with a real admin JWT:
   - `POST /library`
   - `DELETE /library/:id`
   - `POST /journal-feature/:id`
   - `DELETE /journal/:id`
   - `GET /plants?admin_view=true`
   - `DELETE /admin/plants/:id`
6. Verify storage helpers with real runtime config:
   - `POST /upload-url`
   - upload file to returned signed URL
   - `GET /image-url/:path`

## Release call
Backend looks commit-ready and near release-ready for phase-1 integration, provided one final manual pass is done with real JWTs and storage enabled.
