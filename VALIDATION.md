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

### 下一步建议
- 进入 A7：继续拆分 `supabase/functions/server/index.tsx`
- 优先抽离 library / plants / moments / journal / mood 等路由模块
