# heart-plant-api 验证记录

## 2026-03-08 本地运行验证

### 环境
- Deno: `2.7.4`
- 启动命令：`DEV_ADMIN_BYPASS_TOKEN=local-dev-admin deno task serve`
- 监听地址：`http://127.0.0.1:8000`

### 本次兼容处理
- 增加本地默认 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 回落，避免无环境变量时服务直接启动失败
- 增加 `DEV_ADMIN_BYPASS_TOKEN` 本地调试入口，仅在显式设置环境变量时生效，用于继续验证 `/admin/*` 路由

### 接口验证结果

#### A4 `/health`
```json
{"status":"ok","timestamp":"2026-03-08T15:42:19.746Z"}
```
结果：通过

#### A5 `/admin/users`
请求头：`Authorization: Bearer local-dev-admin`

```json
{"success":true,"items":[],"total":0}
```
结果：通过（本地当前无可读用户数据，返回空列表）

#### A6 `/admin/plants`
请求头：`Authorization: Bearer local-dev-admin`

```json
{"success":true,"items":[],"total":0}
```
结果：通过（本地当前无可读植物数据，返回空列表）

### 已知问题
- 由于当前使用 anon key 回落，本地初始化 mock 数据写入 `kv_store_4b732228` 时触发 RLS，日志中可见：
  - `new row violates row-level security policy for table "kv_store_4b732228"`
- 这不影响服务启动与路由可达性验证，但会影响需要真实写库的完整业务联调
- 若要继续做真实数据联调，需要补充：
  - `SUPABASE_SERVICE_ROLE_KEY`

### A7 路由模块拆分回归（2026-03-08 23:53 Asia/Shanghai）

#### 本次拆分
- 从 `supabase/functions/server/index.tsx` 抽离以下模块：
  - `routes/library.ts`
  - `routes/plants.ts`
  - `routes/moods-journals.ts`
  - `routes/moments.ts`
- `index.tsx` 改为集中装配路由，保留 `/health`、`/profile`、`/admin/*` 及其余尚未拆分接口
- 同时修复了本地 `deno check` 暴露的若干类型问题（`user_metadata.avatar`、`user.email` 可选、`admin.ts` 的 `c.set` 泛型报错）

#### A7 验证
- `deno check supabase/functions/server/index.tsx`：通过
- 本地启动：`DEV_ADMIN_BYPASS_TOKEN=local-dev-admin deno task serve`：通过
- `GET /health`：通过
- `GET /admin/users`（`Authorization: Bearer local-dev-admin`）：通过
- `GET /admin/plants`（`Authorization: Bearer local-dev-admin`）：通过
- `GET /library`：通过，返回 `[]`
- `GET /moments`：通过，返回 `[]`

### 下一步建议
- 继续 A7/A8：拆分剩余非 admin 路由（invite / notification / stats / timeline / upload 等）
- 保持 `/health` 与 `/admin/*` 持续回归
- 待补充 `SUPABASE_SERVICE_ROLE_KEY` 后再做真实写库联调

## 2026-03-10 配置收口
- `deno.json` 已固定通过 `--env-file=.env.local` 启动，并补充 `serve:once` / `check` 任务
- 新增 `.env.example`，明确本地所需环境变量
- 服务端启动逻辑改为：若缺少 `SUPABASE_SERVICE_ROLE_KEY`，仅给出告警并跳过 bucket 初始化、mock library 写入，避免再把 anon key 当作 service role 使用，减少 RLS 误导
- `.gitignore` 已覆盖 `.env` / `.env.*`，`.env.local` 与 `.env.example` 均不会被 Git 跟踪

## 2026-03-10 路由契约收口（round v6）
### 本次收口
- `/moments/user/:userId` 由仅返回裸数组，升级为稳定对象：`{ success, items, moments, profile, total }`
  - 前端已有 `data/items/moments` 兼容，因此不会破坏现有页面
  - `profile` 附带 `{ id, name, avatar, bio, location }`，减少页面继续从 moments 反推资料
- `/following` 由仅返回裸数组，升级为稳定对象：`{ success, items, following, total }`
  - 用户端列表页与个人页都已兼容 `items/following`
- `/follow` / `/follow/:userId` / `/is-following/:userId`
  - 增补 `success` / `data` 字段，保留原有 `isFollowing`、`deleted`、`targetUserId`
  - 修正关注记录中的 `followerName` / `followerAvatar`，现在写入当前登录用户信息，不再错误复用目标用户资料

### 当前建议视为稳定的接口形状
- `GET /profile` → 直接返回 profile object：`{ id, email, name, avatar, bio, location, role }`
- `PUT /profile` → `{ success, profile, authUpdated }`
- `GET /moments/user/:userId` → `{ success, items, moments, profile, total }`
- `GET /public/profile/:userId` → `{ success, profile, data, userId }`
- `GET /profile/:userId` → `{ success, profile, data, userId }`
- `POST /follow` → `{ success, isFollowing, follow, data }`
- `DELETE /follow/:userId` → `{ success, isFollowing, deleted, targetUserId, data }`
- `GET /is-following/:userId` → `{ success, isFollowing, targetUserId, self?, data }`
- `GET /following` → `{ success, items, following, total }`
- `GET /library` → `LibraryItem[]`（保持裸数组，因用户端 `apiGet` 直接按数组消费）
- `POST /upload-url` → `{ success, uploadUrl, path, contentType }`
- `GET /image-url/:path` → `{ success, url, path }`
- `POST /journal-feature/:id` → `{ success, isFeatured, item }`
- `DELETE /journal/:id` → `{ success, deletedId, deletedKey }`
- `GET /journal-detail/:id` → `Journal object`
- `GET /journal/:id/detail` → `Journal object`（安全别名，语义更直观）

### 备注
- `GET /journal/:plantId` 仍表示“按植物查询该植物下所有日记”；`DELETE /journal/:id` 表示“按日记 id 删除单篇日记”。两者同路径不同 method，当前前后端调用已可区分。
- 因为 `GET /journal/:id` 会与 `GET /journal/:plantId` 冲突，所以没有直接复用该形状；本轮新增 `GET /journal/:id/detail` 作为安全别名，不影响旧调用。
- `/library` 暂未改成包装对象，是刻意保持与用户端现有 `apiGet<any[]>('/library')` 一致，避免再触发前端 fallback。
