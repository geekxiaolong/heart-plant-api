# 认领被拒绝（DUPLICATE_ADOPTION）排查说明

用户看到「认领被拒绝（DUPLICATE_ADOPTION）。请让管理员部署最新后端（已取消重复认领限制）后重试。」时，按本文排查。

---

## 1. 结论

**本仓库的认领接口（POST /adopt）已取消「重复认领」校验，代码中不会返回 `DUPLICATE_ADOPTION`。**

若用户仍看到该提示，说明认领请求**没有**到达当前版本的后端，而是被以下之一处理并返回了该错误：

- 旧版 Supabase Edge Function 仍在运行
- 网关 / Make.com 等中间层对认领做了拦截或改写

---

## 2. 管理员处理步骤

### 步骤一：部署最新后端

在 `heart-plant-api` 目录执行：

```bash
# 使用 Supabase CLI 部署 Edge Function
supabase functions deploy server
```

或按你们现有流程（如 CI/CD）部署 `heart-plant-api/supabase/functions/` 下的最新代码。

### 步骤二：确认请求是否打到新版本

1. **看请求 URL**  
   前端调用的认领地址应为：  
   `https://<项目>.supabase.co/functions/v1/make-server-4b732228/adopt`  
   或你们配置的 `VITE_API_BASE_URL` 对应的域名。

2. **直接调接口验证**（用已登录用户的 JWT）：
   ```bash
   curl -X POST "https://<项目>.supabase.co/functions/v1/make-server-4b732228/adopt" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
     -H "X-User-JWT: <用户 JWT>" \
     -d '{"libraryId":"银皇后","name":"测试","species":"银皇后"}'
   ```
   - 若返回 `200` 且 body 含 `success: true`、`id`（如 `plant:银皇后-xxx`），说明**当前后端已取消重复认领限制**，不会返回 DUPLICATE_ADOPTION。
   - 若返回的 body 里出现 `DUPLICATE_ADOPTION` 或 `error: "DUPLICATE_ADOPTION"`，则说明请求仍被旧逻辑或中间层处理。

3. **检查 Supabase 控制台**  
   在 Supabase Dashboard → Edge Functions 中确认 `server` 的**最后部署时间**是否为本次部署。

### 步骤三：若经过 Make.com / 网关

- 若认领请求先到 **Make.com** 再转发到 Supabase：
  - 检查 Make 场景里是否有「已认领过该品种则返回 DUPLICATE_ADOPTION」的逻辑，若有请**删除或关闭**。
  - 或将认领请求改为**直接转发**到 Supabase Edge Function，不做重复校验。
- 若有 **Nginx / 网关 / 自建 BFF**：
  - 确认没有在中间层对 `/adopt` 做「重复认领」判断并返回 DUPLICATE_ADOPTION。

---

## 3. 产品规则（当前后端）

- 同一用户**可以**多次认领同一品种（同一 `libraryId`），每次都会生成一条新记录（`plant:${libraryId}-${timestamp}`）。
- 接口**永不**返回 `DUPLICATE_ADOPTION`；若出现，必为旧版本或中间层行为。

---

## 4. 相关代码位置

- 认领接口：`heart-plant-api/supabase/functions/server/routes/plants.ts` → `plants.post("/adopt", ...)`
- 认领逻辑说明：`heart-plant-api/docs/adoption-server-logic.md`
