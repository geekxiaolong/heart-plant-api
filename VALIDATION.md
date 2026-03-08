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
