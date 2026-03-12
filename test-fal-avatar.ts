/**
 * 本地测试 fal 生图接口（认领用同一套逻辑）
 * 运行: deno run --env-file=.env.local -A test-fal-avatar.ts
 */
import { generatePlantCartoonImage } from "./supabase/functions/server/lib/fal-avatar.ts";

const falKey = Deno.env.get("FAL_KEY")?.trim();
if (!falKey) {
  console.error("❌ FAL_KEY 未设置，请在 .env.local 中配置");
  Deno.exit(1);
}

console.log("🔄 调用 fal.ai 生成植物卡通图（测试）...");
const url = await generatePlantCartoonImage(falKey, {
  plantName: "银皇后",
  plantType: "观叶植物",
});

if (url) {
  console.log("✅ 成功，图片 URL:", url);
} else {
  console.error("❌ 生成失败，请查看上方错误日志");
  Deno.exit(1);
}
