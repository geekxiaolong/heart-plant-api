# 认领与植物数据

## 同一品种可认领多棵（产品规则，禁止拦截）

后端 **POST /adopt** 不做「已拥有该品种」的校验，同一用户可多次认领同一 `libraryId`（品种）。每次认领都会生成新 key：`plant:${libraryId}-${Date.now()}`，写入一条新植物记录。**禁止**在 adopt 或下游做“已拥有该品种则拒绝”的拦截，**禁止**返回 `DUPLICATE_ADOPTION`。若线上仍出现该错误，说明运行的是旧版本或存在中间层拦截，请重新部署本仓库并检查网关/Make 等。

---

# 认领植物「名称与品种一致」排查

## 说明

认领植物在 KV 中存有 `name`（用户命名）和 `species`（品种，来自植物库）。若历史数据或旧逻辑把同一值写入了两者，则称为「名称与品种一致」的脏数据。

## 排查接口

- **GET** `/admin/plants-dirty-report`
- **鉴权**：需管理员（`Authorization: Bearer <JWT>`，且用户为 admin 或 776427024@qq.com）

### 返回示例

```json
{
  "success": true,
  "total": 12,
  "nameEqualsSpeciesCount": 8,
  "items": [
    {
      "key": "plant:银皇后-1731234567890",
      "id": "plant:银皇后-1731234567890",
      "name": "银皇后",
      "species": "银皇后",
      "libraryId": "银皇后",
      "librarySpecies": "银皇后"
    }
  ]
}
```

- `total`: 认领植物总数  
- `nameEqualsSpeciesCount`: 存储中 name 与 species 完全一致的条数  
- `items`: 满足「名称与品种一致」的植物列表（key、id、name、species、libraryId、librarySpecies）

## 调用方式

1. **后台已登录管理员**：在 heart-plant-admin 或任意能带管理员 JWT 的客户端请求  
   `GET <API_BASE>/admin/plants-dirty-report`  
   例如：`GET https://dkszigraljeptpeiimzg.supabase.co/functions/v1/make-server-4b732228/admin/plants-dirty-report`

2. **curl（需先取得管理员 JWT）**  
   ```bash
   curl -s -H "Authorization: Bearer YOUR_ADMIN_JWT" \
     "https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4b732228/admin/plants-dirty-report"
   ```

## 修复品种

已有接口 **POST** `/admin/fix-plant-species` 会按植物库校正每条认领植物的 `species` 与 `libraryId`，不修改 `name`。  
若希望「名称与品种一致」的条目在展示上区分，需在前端或后续策略里单独处理（例如允许用户编辑名称）。

## 按账号修复品种（改为默认向日葵）

- **POST** `/admin/fix-user-plant-species`
- **Body**：`{ "email": "776427024@qq.com", "defaultSpecies": "向日葵" }`（`defaultSpecies` 可省略，默认向日葵）
- **鉴权**：需管理员 JWT。

逻辑：只处理 `ownerEmails` 包含该 email 的植物；以下情况视为品种错误并改为 `defaultSpecies`：  
品种为空、与植物库中对应 `libraryId` 的品种不一致、或名称与品种一致（脏数据）。  
返回 `{ success, email, defaultSpecies, fixed, report }`，`report` 为被修正的条目列表（含 key、id、name、species、libraryId、reason）。

本地脚本（需可用的管理员登录与 API）：在 `heart-plant` 目录执行  
`EMAIL=776427024@qq.com PASSWORD=你的密码 node scripts/fix-user-plant-species.mjs`  
若 Supabase 已禁用 Legacy API keys，需在浏览器登录后从控制台取 JWT，再用 curl 调用上述接口。
