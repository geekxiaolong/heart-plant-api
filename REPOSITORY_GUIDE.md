# heart-plant-api 仓库说明文档

## 仓库定位
三端分离后的后端 API 仓库，承接原单体项目中的业务接口。

## 当前职责
- 用户业务接口
- 管理后台接口
- 认证鉴权
- 数据访问
- 文件/快照相关能力

## 技术栈
- Deno
- Hono
- Supabase Edge Functions

## 目录说明
- `supabase/functions/server/index.tsx`：当前主入口
- `supabase/functions/server/routes/`：路由模块
- `supabase/functions/server/kv_store.tsx`：KV 存储访问

## 开发原则
1. 保持原接口兼容
2. 保持原数据结构不变
3. 拆出 `/admin/*` 独立接口能力
4. 后续逐步模块化 `index.tsx`

## 当前状态
- 已独立建仓
- 已接入 admin 路由模块
- 正在继续拆分接口与服务层
