# heart-plant-api

植物记三端分离后的后端 API 仓库（Supabase Edge Functions / Deno）。

## 当前状态
- 当前判断：**代码与接口已接近发布，仍需最后一轮真实凭据验证**
- 静态检查：`deno task check` 已通过
- 当前已闭环接口能力：
  - `/profile` 读写
  - follow / unfollow / is-following / following
  - public profile / user moments 查询
  - admin library 写路径与删除
  - journal feature / delete / detail alias
  - upload-url / image-url helper

## 本地运行
1. 复制环境文件：
```bash
cp .env.example .env.local
```
2. 填入真实变量后启动：
```bash
deno task serve
```
如需单次启动：
```bash
deno task serve:once
```
静态检查：
```bash
deno task check
```

## 必要环境变量
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `DEV_ADMIN_BYPASS_TOKEN`（可选，仅本地调试 `/admin/*`）

> 缺少 `SUPABASE_SERVICE_ROLE_KEY` 时，不应再把系统视为“可完整写入”。当前实现会退化为只读/部分能力可用，并跳过 bucket 初始化与若干写路径联调。

## 部署
```bash
supabase functions deploy server
```
部署后生效的规则包含：**同一品种可认领多棵**（接口不做“已拥有该品种则拒绝”的校验）。若线上仍报 DUPLICATE_ADOPTION，说明当前运行的仍是旧版本，需用本仓库重新执行上述部署。

## 最小后端验收
见根目录：`FINAL_ACCEPTANCE_RUNBOOK.md`
- 后端侧重点：`B1 ~ B4`

推荐顺序：
1. `GET /health`
2. `GET /library`
3. 真实用户 JWT：`/profile`、moments、follow/unfollow
4. 真实管理员 JWT：library / journal / admin plants
5. 存储链路：`/upload-url` -> 上传 -> `/image-url/:path`

## 当前真实阻塞
1. 缺 `SUPABASE_SERVICE_ROLE_KEY`
2. 缺真实测试账号 / 有效 Supabase 登录态
3. 根仓库未配置 `origin`（不影响本地验收，只影响根目录文档 push）

## 常见问题

### 如何修复植物品种脏数据（例如品种显示成昵称 xinxin）？
- 已提供管理端接口，用植物库数据重写每条植物的 `species`（品种）并写回 KV。
- **调用方式**（需已登录管理员账号）：  
  `POST /admin/fix-plant-species`，请求头带管理员 JWT（与请求 `/admin/plants` 相同）。
- 本地 API 示例（先登录管理后台拿到 token，或在控制台用当前 session 的 access_token）：
  ```bash
  curl -X POST "http://127.0.0.1:8000/admin/fix-plant-species" \
    -H "Authorization: Bearer <管理员JWT>" -H "Content-Type: application/json"
  ```
- 返回示例：`{ "success": true, "fixed": 3, "total": 3 }`。执行一次即可，之后刷新前端即可看到正确品种。

### 认领时报「认领被拒绝（DUPLICATE_ADOPTION）」？
- **原因**：当前线上运行的 Edge Function 可能是旧版本，仍包含「同一品种只能认领一棵」的校验。
- **处理**：部署本仓库最新代码即可（当前代码已取消该限制，同一品种可认领多棵）：
  ```bash
  supabase functions deploy server
  ```
  部署完成后让用户刷新页面再试认领。

### 为什么「我的植物」里全部显示同一品种（例如全是薰衣草）？
- **原因**：植物名称来自「认领时选择的植物库条目」。若植物库只有一条（或你多次认领的都是同一条），接口返回的已认领植物就会是同一个名字。
- **处理**：
  1. 确保已配置 `SUPABASE_SERVICE_ROLE_KEY` 并重启 API。启动时会执行 `initializeMockPlants()`，向植物库写入 8 种品种（银皇后、珍珠吊兰、龟背竹、琴叶榕、虎皮兰、绿萝、薰衣草、静夜多肉）。缺 key 时该初始化会跳过，库可能为空或只有你在后台手动加的一条。
  2. 在管理后台「植物库管理」中确认有多条不同品种；若只有一条，请添加多种品种或等待上述 mock 初始化完成。
  3. 之后从发现页选择**不同**品种进入认领，新认领的植物就会显示对应名称。

## 相关文档
- `USAGE.md`
- `REPOSITORY_GUIDE.md`
- `VALIDATION.md`
- `RELEASE_READINESS_BACKEND.md`
- 根目录 `FINAL_ACCEPTANCE_RUNBOOK.md`
