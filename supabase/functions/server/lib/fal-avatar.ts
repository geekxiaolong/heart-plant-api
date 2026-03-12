/**
 * fal.ai 植物卡通图生成（认领时或手动触发）
 * 使用 queue 提交后轮询结果，prompt 含风格 + 植物品种名称（控制长度以保证兼容）
 */
const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_MODEL = "fal-ai/flux/dev";
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_WAIT_MS = 120000;

const DEFAULT_STYLE_PROMPT =
  "Cute potted plant illustration with a cartoon face on the pot, clean vector doodle style, bold black outlines, flat bright colors, minimal details, no gradients.";

export function buildCartoonPrompt(opts: {
  plantName?: string;
  plantType?: string;
  customPrompt?: string;
}): string {
  const style =
    opts.customPrompt?.trim() && opts.customPrompt.trim().length > 0
      ? opts.customPrompt.trim().slice(0, 400)
      : DEFAULT_STYLE_PROMPT;
  const name = (opts.plantName || "小绿植").trim().slice(0, 40);
  const type = (opts.plantType || "观叶植物").trim().slice(0, 30);
  return `${style} Plant: ${name}, ${type}.`;
}

function getStatusUrl(requestId: string): string {
  return `${FAL_QUEUE_BASE}/${FAL_MODEL}/requests/${requestId}/status`;
}

function getResultUrl(requestId: string): string {
  return `${FAL_QUEUE_BASE}/${FAL_MODEL}/requests/${requestId}`;
}

/**
 * 调用 fal.ai 队列：提交 → 轮询结果 → 返回图片 URL，失败返回 null 并打日志
 */
export async function generatePlantCartoonImage(
  falKey: string,
  opts: { plantName?: string; plantType?: string; customPrompt?: string }
): Promise<string | null> {
  const prompt = buildCartoonPrompt(opts);
  const headers: Record<string, string> = {
    Authorization: `Key ${falKey}`,
    "Content-Type": "application/json",
  };

  const submitRes = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      num_images: 1,
      num_inference_steps: 28,
      guidance_scale: 3.5,
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.error("fal submit failed:", submitRes.status, errText);
    return null;
  }

  const submitBody = (await submitRes.json()) as { request_id?: string };
  const requestId = submitBody?.request_id;
  if (!requestId || typeof requestId !== "string") {
    console.error("fal submit response missing request_id:", submitBody);
    return null;
  }

  const deadline = Date.now() + POLL_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(getStatusUrl(requestId), { method: "GET", headers });
    if (!statusRes.ok) {
      console.error("fal status failed:", statusRes.status, await statusRes.text());
      return null;
    }
    const statusData = (await statusRes.json()) as { status?: string };
    if (statusData?.status !== "COMPLETED") {
      continue;
    }
    const resultRes = await fetch(getResultUrl(requestId), { method: "GET", headers });
    if (!resultRes.ok) {
      console.error("fal result failed:", resultRes.status, await resultRes.text());
      return null;
    }
    const data = (await resultRes.json()) as {
      images?: Array<{ url?: string }>;
      data?: { images?: Array<{ url?: string }> };
      response?: { images?: Array<{ url?: string }> };
    };
    const images = data?.images ?? data?.data?.images ?? data?.response?.images ?? [];
    const url = images[0]?.url;
    if (typeof url === "string" && url.length > 0) {
      return url;
    }
    console.error("fal result has no images:", data);
    return null;
  }

  console.error("fal timeout after", POLL_MAX_WAIT_MS, "ms, request_id:", requestId);
  return null;
}
