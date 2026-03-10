# heart-plant-api 使用文档

## 1. 本地运行
1. 复制环境文件：
```bash
cp .env.example .env.local
```
2. 填入以下变量后启动：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`（必需；缺失时写入 / 管理接口 / bucket 初始化会因 RLS 受限）
   - `SUPABASE_ANON_KEY`
   - `DEV_ADMIN_BYPASS_TOKEN`（可选，仅本地调试 `/admin/*`）

启动命令：
```bash
deno task serve
```
如需单次启动（不 watch）：
```bash
deno task serve:once
```
静态检查：
```bash
deno task check
```

## 2. 部署方式
```bash
supabase functions deploy server
```

## 3. 当前接口方向
### 保留原业务接口
- `/signup`
- `/profile`
- `/library`
- `/plants`
- `/adopt`
- `/mood/*`
- `/journal/*`
- `/moments/*`
- `/follow/*`
- `/invite/*`
- `/stats/*`
- `/achievements`
- `/notifications/*`
- `/upload-snapshot`
- `/health`

### admin 接口
- `/admin/users`
- `/admin/plants`
- `/admin/plants/:id`

## 4. 环境要求
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

## 5. 当前说明
本仓库为三端分离后的 API 项目，目前处于接口拆分与兼容整理阶段。
