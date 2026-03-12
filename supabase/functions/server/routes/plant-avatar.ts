/**
 * 植物卡通形象生成接口
 * 使用 fal.ai FLUX 文本生成图像，prompt 含风格 + 植物品种名称
 */
import { Hono } from "npm:hono";
import { buildCartoonPrompt } from "../lib/fal-avatar.ts";

const FAL_FLUX_DEV = "https://fal.run/fal-ai/flux/dev";

interface PlantAvatarRouteDeps {
  getUser: (c: any) => Promise<any>;
}

export function createPlantAvatarRoutes(deps: PlantAvatarRouteDeps) {
  const router = new Hono();

  /**
   * POST /plant-avatar/generate
   * Body: { plantName?: string, plantType?: string, customPrompt?: string }
   * 需要登录。依赖环境变量 FAL_KEY（fal.ai API Key）。
   */
  router.post("/plant-avatar/generate", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) {
        return c.json({ success: false, error: "Unauthorized" }, 401);
      }

      const falKey = Deno.env.get("FAL_KEY")?.trim();
      if (!falKey) {
        console.error("FAL_KEY is not set");
        return c.json(
          {
            success: false,
            error: "Avatar generation is not configured",
            details: "Missing FAL_KEY",
          },
          503,
        );
      }

      const body = await c.req.json().catch(() => ({}));
      const plantName = typeof body.plantName === "string" ? body.plantName : undefined;
      const plantType = typeof body.plantType === "string" ? body.plantType : undefined;
      const customPrompt = typeof body.customPrompt === "string" ? body.customPrompt : undefined;

      const prompt = buildCartoonPrompt({
        plantName,
        plantType,
        customPrompt,
      });

      const res = await fetch(FAL_FLUX_DEV, {
        method: "POST",
        headers: {
          "Authorization": `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size: "square_hd",
          num_images: 1,
          num_inference_steps: 28,
          guidance_scale: 3.5,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("fal.ai request failed:", res.status, errText);
        return c.json(
          {
            success: false,
            error: "Image generation failed",
            details: errText.slice(0, 200),
          },
          502,
        );
      }

      const data = await res.json() as {
        images?: Array<{ url?: string; content_type?: string }>;
        prompt?: string;
      };

      const images = data?.images ?? [];
      const first = images[0];
      const imageUrl = first?.url ?? null;

      if (!imageUrl) {
        return c.json(
          { success: false, error: "No image in response", raw: data },
          502,
        );
      }

      return c.json({
        success: true,
        imageUrl,
        images: images.map((img) => ({ url: img?.url, contentType: img?.content_type })),
        prompt: data?.prompt ?? prompt,
      });
    } catch (err: any) {
      console.error("plant-avatar/generate error:", err);
      return c.json(
        {
          success: false,
          error: "Failed to generate plant avatar",
          details: err?.message ?? String(err),
        },
        500,
      );
    }
  });

  return router;
}
