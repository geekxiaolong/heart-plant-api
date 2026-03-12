# 确认认领服务端逻辑分析

> 接口：`POST /make-server-4b732228/adopt`  
> 入口：`heart-plant-api/supabase/functions/server/routes/plants.ts`

---

## 1. 流程总览

```
请求进入 → 鉴权 → 校验 libraryId → 读植物库 → 构建认领记录 → 检查 FAL_KEY → 生成卡通图 → 兜底图片 → 写入 KV → 更新用户统计 → 返回
```

任一环节失败会直接返回对应错误，不写入认领记录。

---

## 2. 步骤拆解

### 2.1 鉴权

- 从请求中解析用户：`getUser(c)`（依赖 `X-User-JWT` 或 `Authorization`，Supabase Auth）。
- **未登录**：返回 `401 Unauthorized`，不继续。

### 2.2 参数校验

- **Body**：`body.libraryId || body.originalId || body.id`，取第一个非空字符串，trim 后作为 `libraryId`。
- **缺失**：若 `libraryId` 为空，返回 `400`，`{ error: "Library id is required", success: false }`。

### 2.3 产品规则（无重复校验）

- **不做**「用户是否已拥有该品种」的校验。
- 不查用户已有植物列表，**不返回** `DUPLICATE_ADOPTION`。
- 每次请求都会生成**新**认领记录，key 为 `plant:${libraryId}-${Date.now()}`，即同一品种可被同一用户认领多棵。

### 2.4 读取植物库并构建认领记录

1. **读库**：`kv.get("library:" + libraryId)` 得到 `libraryItem`（可能为空，不影响创建）。
2. **生成 key**：`plantKey = "plant:" + libraryId + "-" + Date.now()`，例如 `plant:银皇后-1731234567890`。
3. **构建记录**：调用 `buildAdoptedPlant({ libraryItem, requestBody: body, user, plantKey })`（见下节），得到 `newPlant`。

### 2.5 buildAdoptedPlant 逻辑（plant-mapper.ts）

- **品种 species**：`normalizedLibrary.species` → `normalizedLibrary.name` → `requestBody.species`，保证来自库或请求，不用「用户昵称」当品种。
- **名称 name**：`requestBody.name` → 库/请求中的 name → species → `"我的植物"`。若最终 name 与 species 完全相同，则存**空字符串**，避免「名称=品种」脏数据，展示由前端用品种回退。
- **归属**：
  - `ownerEmails`: `[user.email.toLowerCase()]`
  - `ownerIds`: `[user.id]`
  - `owners`: 取 `requestBody.ownerName` / `userName` / `user_metadata.name` / 邮箱前缀 / `"用户"`
- **ID 与库关联**：`id`、`plantId` 均为 `plantKey`；`libraryId`、`originalId`、`sourcePlantId` 均来自库或请求的品种 ID。
- **时间**：`adoptedAt`、`created_at`、`createdAt` 均为当前 ISO 时间。
- 其余字段从 `normalizedLibrary`、`normalizedRequest`、`requestBody` 合并，再经 `normalizePlantRecord` 做字段归一化。

### 2.6 卡通图与 FAL 配置

- **环境变量**：读取 `FAL_KEY`。未配置或空则返回 `503`，`error: "ADOPTION_UNAVAILABLE"`，文案为「认领功能暂未就绪：请配置卡通形象生成服务后再试。」
- **调用**：`generatePlantCartoonImage(falKey, { plantName: species, plantType: type, customPrompt })`  
  - `species`：库 → newPlant.species  
  - `type`：库 → newPlant.type → body.type  
  - `customPrompt`：库或 body，用于 fal 的 prompt 文本（有长度截断）。
- **fal-avatar 行为**：向 fal 队列提交任务，轮询至完成（约 2.5s 间隔，最长约 120s），取返回的第一张图片 URL；超时或失败返回 `null`。

### 2.7 兜底图片

- 若 fal 返回的 `cartoonUrl` 为空或失败，则尝试兜底：
  - `libraryItem.imageUrl / image / coverImage` → `body.imageUrl / image`
- 若兜底仍无有效 URL，返回 `502`，`error: "CARTOON_GENERATION_FAILED"`，文案为「植物卡通形象生成失败，且无可用兜底图片。」

### 2.8 写入与统计

- 将 `cartoonUrl`（或兜底 URL）写入 `newPlant.cartoonImageUrl`。
- **KV 写入**：`kv.set(plantKey, newPlant)`，即表 `kv_store_4b732228` 中 key = `plantKey`，value = 整条认领记录。
- **用户统计**：`updateUserStats(user.id, "plants", 1)`，即 `stats:${userId}` 中 `plantsAdopted` +1，并可能触发等级/成就逻辑。

### 2.9 响应

- 成功：`200`，body 为 `{ ...newPlant, success: true }`（含 id、plantId、name、species、cartoonImageUrl、ownerEmails、ownerIds、adoptedAt 等）。
- 其它异常：`400`，`{ error: "Failed to adopt plant", details: err.message, success: false }`。

---

## 3. 依赖与数据流

| 依赖 | 用途 |
|------|------|
| `getUser(c)` | 鉴权，取当前用户 id、email、user_metadata |
| `kv.get("library:" + libraryId)` | 读植物库条目，补全 species/type/image 等 |
| `kv.set(plantKey, newPlant)` | 持久化认领记录 |
| `updateUserStats(user.id, "plants", 1)` | 更新用户认领数与等级/成就 |
| `FAL_KEY` | 调用 fal 生成卡通图 |
| `generatePlantCartoonImage` | fal 队列提交 + 轮询，返回图片 URL |

---

## 4. 错误码与含义

| HTTP | error 或场景 | 说明 |
|------|----------------|------|
| 401 | Unauthorized | 未登录 |
| 400 | Library id is required | 未传 libraryId/originalId/id |
| 400 | Failed to adopt plant | 其它业务/运行时异常 |
| 502 | CARTOON_GENERATION_FAILED | 卡通图生成失败且无兜底图 |
| 503 | ADOPTION_UNAVAILABLE | 未配置 FAL_KEY，认领功能关闭 |

---

## 5. 小结

- **认领** = 登录用户 + 有效 `libraryId` + 能拿到一张卡通图（fal 或兜底）→ 生成唯一 `plant:${libraryId}-${timestamp}` 记录并写入 KV，同时给用户 +1 认领数。
- **品种** 由植物库（及请求里的 species）决定；**名称** 可来自请求，若与品种相同则存空，避免脏数据。
- **不限制**同一用户对同一品种的认领次数，不做「已拥有该品种则拒绝」的校验。
- **本接口永不返回** `DUPLICATE_ADOPTION`。若用户仍看到「认领被拒绝（DUPLICATE_ADOPTION）」：多为旧版后端或网关/Make 等中间层返回，请部署当前仓库后端并确认请求打到新版本。
