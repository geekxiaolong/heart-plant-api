import { Hono } from "npm:hono";
import {
  buildAdoptedPlant,
  normalizePlantRecord,
  resolvePlantFromCollection,
} from "../lib/plant-mapper.ts";
import { generatePlantCartoonImage } from "../lib/fal-avatar.ts";

/** 产品规则：同一品种可认领多棵，adopt 接口不得做“已拥有该品种则拒绝”的拦截。 */
const ALLOW_MULTIPLE_ADOPTIONS_SAME_VARIETY = true;

interface PlantsRouteDeps {
  getUser: (c: any) => Promise<any>;
  updateUserStats: (
    userId: string,
    type:
      | "posts"
      | "likes"
      | "comments"
      | "water"
      | "fertilizer"
      | "plants"
      | "streak"
      | "exp"
      | "sync",
    increment?: number,
    forceValues?: any,
  ) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
  };
  /** 按 key 拉取植物库，用于品种校正（value 无 id 时用 key 推导） */
  getLibraryWithKeys?: () => Promise<{ key: string; value: any }[]>;
  /** 按 key 拉取植物，保证能从 key 解析 libraryId */
  getPlantsWithKeys?: () => Promise<{ key: string; value: any }[]>;
}

function isAdminUser(user: any) {
  const userEmail = user?.email?.toLowerCase?.();
  return user?.user_metadata?.role === "admin" ||
    userEmail === "776427024@qq.com";
}

export function createPlantRoutes(deps: PlantsRouteDeps) {
  const plants = new Hono();

  plants.get("/plants", async (c) => {
    try {
      const user = await deps.getUser(c);
      const plantRows = deps.getPlantsWithKeys
        ? await deps.getPlantsWithKeys()
        : (await deps.kv.getByPrefix("plant:")).map((value: any) => ({ key: "", value }));
      const allPlants = plantRows.map((row: { key: string; value: any }) => {
        const key = typeof row.key === "string" ? row.key : "";
        const v = row.value;
        const withId = key ? { ...v, id: v?.id ?? key, plantId: v?.plantId ?? v?.id ?? key } : v;
        return normalizePlantRecord(withId);
      });
      const isAdminView = c.req.query("admin_view") === "true";

      if (!user) return c.json([]);

      const userEmail = user.email?.toLowerCase();
      if (isAdminUser(user) && isAdminView) return c.json(allPlants);

      let userPlants = allPlants.filter((p: any) =>
        p.ownerEmails?.some((e: string) => e.toLowerCase() === userEmail) ||
        p.ownerIds?.includes(user.id)
      );
      const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
      const limit = Math.max(1, parseInt(c.req.query("limit") || `${userPlants.length || 1}`) || (userPlants.length || 1));
      // 品种始终用植物库，避免显示成用户昵称或全部显示同一品种（如薰衣草）
      const libraryRows = deps.getLibraryWithKeys
        ? await deps.getLibraryWithKeys()
        : (await deps.kv.getByPrefix("library:")).map((value: any) => ({ key: "", value }));
      const libById: Record<string, any> = {};
      for (const row of libraryRows) {
        const key = typeof row.key === "string" ? row.key : "";
        const value = row.value;
        const id = (value?.id != null ? String(value.id) : key.replace(/^library:/, "")).trim();
        if (id) libById[id] = value;
      }
      const resolveLibId = (p: any) => {
        const fromField = p.libraryId ?? p.originalId ?? p.sourcePlantId;
        if (fromField) return String(fromField).replace(/^library:/, "").trim();
        const rawId = (p.id ?? p.plantId ?? "").toString();
        if (typeof rawId !== "string" || !rawId) return "";
        const withoutPrefix = rawId.startsWith("plant:") ? rawId.replace(/^plant:/, "") : rawId;
        const firstPart = withoutPrefix.split("-")[0]?.trim();
        if (firstPart && firstPart.length < 50) return firstPart;
        return "";
      };
      userPlants = userPlants.map((p: any) => {
        const lid = resolveLibId(p);
        const lib = lid ? libById[lid] : null;
        if (!lib) return p;
        const varietyFromLib = (lib.species ?? lib.variety ?? lib.name ?? "").toString().trim();
        const nameFromLib = (lib.name ?? lib.species ?? "").toString().trim();
        return {
          ...p,
          species: varietyFromLib || p.species,
          name: (p.name && String(p.name).trim()) ? p.name : (nameFromLib || p.name),
          libraryId: p.libraryId ?? lid,
          originalId: p.originalId ?? lid,
        };
      });
      const start = (page - 1) * limit;
      const end = start + limit;
      return c.json(userPlants.slice(start, end));
    } catch (err: any) {
      return c.json(
        { error: "Failed to fetch plants", details: err.message },
        500,
      );
    }
  });

  /**
   * 修改认领植物的用户命名。仅允许更新 name 字段，禁止修改 species（品种由认领时的植物库决定，不可变更）。
   */
  plants.patch("/plants/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const id = c.req.param("id");
      if (!id) return c.json({ error: "Plant id is required" }, 400);

      const plantRows = deps.getPlantsWithKeys
        ? await deps.getPlantsWithKeys()
        : (await deps.kv.getByPrefix("plant:")).map((value: any) => ({ key: "", value }));
      const allPlants = plantRows.map((row: { key: string; value: any }) => {
        const key = typeof row.key === "string" ? row.key : "";
        const v = row.value;
        const withId = key ? { ...v, id: v?.id ?? key, plantId: v?.plantId ?? v?.id ?? key } : v;
        return normalizePlantRecord(withId);
      });
      const plant = resolvePlantFromCollection(allPlants, id);
      if (!plant) return c.json({ error: "Plant not found" }, 404);

      const userEmail = user.email?.toLowerCase();
      const canEdit = isAdminUser(user) ||
        plant.ownerEmails?.some((e: string) => e.toLowerCase() === userEmail) ||
        plant.ownerIds?.includes(user.id);
      if (!canEdit) return c.json({ error: "Forbidden" }, 403);

      const body = await c.req.json().catch(() => ({}));
      const newName = typeof body?.name === "string" ? body.name.trim() : undefined;
      if (newName === undefined) {
        return c.json({ error: "name is required for update" }, 400);
      }

      const storageKey = plant.id;
      const raw = await deps.kv.get(storageKey);
      if (!raw || typeof raw !== "object") {
        return c.json({ error: "Plant record not found in storage" }, 404);
      }

      const updated = { ...raw, name: newName };
      await deps.kv.set(storageKey, updated);

      const normalized = normalizePlantRecord({ ...updated, id: updated.id ?? plant.id, plantId: updated.plantId ?? plant.id });
      return c.json(normalized);
    } catch (err: any) {
      return c.json(
        { error: "Failed to update plant name", details: err.message },
        400,
      );
    }
  });

  plants.get("/plants/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const plantRows = deps.getPlantsWithKeys
        ? await deps.getPlantsWithKeys()
        : (await deps.kv.getByPrefix("plant:")).map((value: any) => ({ key: "", value }));
      const allPlants = plantRows.map((row: { key: string; value: any }) => {
        const key = typeof row.key === "string" ? row.key : "";
        const v = row.value;
        const withId = key ? { ...v, id: v?.id ?? key, plantId: v?.plantId ?? v?.id ?? key } : v;
        return normalizePlantRecord(withId);
      });
      let plant = resolvePlantFromCollection(allPlants, c.req.param("id"));
      if (!plant) return c.json({ error: "Plant not found" }, 404);

      const userEmail = user.email?.toLowerCase();
      const canAccess = isAdminUser(user) ||
        plant.ownerEmails?.some((e: string) => e.toLowerCase() === userEmail) ||
        plant.ownerIds?.includes(user.id);

      if (!canAccess) return c.json({ error: "Forbidden" }, 403);

      const libraryRows = deps.getLibraryWithKeys
        ? await deps.getLibraryWithKeys()
        : (await deps.kv.getByPrefix("library:")).map((value: any) => ({ key: "", value }));
      const libById: Record<string, any> = {};
      for (const row of libraryRows) {
        const key = typeof row.key === "string" ? row.key : "";
        const value = row.value;
        const id = (value?.id != null ? String(value.id) : key.replace(/^library:/, "")).trim();
        if (id) libById[id] = value;
      }
      const resolveLibId = (p: any) => {
        const fromField = p.libraryId ?? p.originalId ?? p.sourcePlantId;
        if (fromField) return String(fromField).replace(/^library:/, "").trim();
        const rawId = (p.id ?? p.plantId ?? "").toString();
        if (typeof rawId !== "string" || !rawId) return "";
        const withoutPrefix = rawId.startsWith("plant:") ? rawId.replace(/^plant:/, "") : rawId;
        const firstPart = withoutPrefix.split("-")[0]?.trim();
        if (firstPart && firstPart.length < 50) return firstPart;
        return "";
      };
      const lid = resolveLibId(plant);
      const lib = lid ? libById[lid] : null;
      if (lib) {
        const varietyFromLib = (lib.species ?? lib.variety ?? lib.name ?? "").toString().trim();
        const nameFromLib = (lib.name ?? lib.species ?? "").toString().trim();
        plant = {
          ...plant,
          species: varietyFromLib || plant.species,
          name: (plant.name && String(plant.name).trim()) ? plant.name : (nameFromLib || plant.name),
          libraryId: plant.libraryId ?? lid,
          originalId: plant.originalId ?? lid,
        };
      }
      return c.json(plant);
    } catch (err: any) {
      return c.json(
        { error: "Failed to fetch plant", details: err.message },
        500,
      );
    }
  });

  /**
   * 认领植物。
   * 【产品规则】同一品种可认领多棵。本接口无「已拥有该品种则拒绝」的校验：
   * 不查询用户是否已认领过该 libraryId，永不返回 DUPLICATE_ADOPTION。
   * 每次请求仅生成新 key（plant:${libraryId}-${Date.now()}）并写入新记录。
   * 若用户端仍看到「认领被拒绝（DUPLICATE_ADOPTION）」：说明请求未到达本版本（旧后端或网关/ Make 等中间层返回），请部署最新后端并确认流量指向新版本。
   */
  plants.post("/adopt", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json();
      const libraryId = String(
        body.libraryId || body.originalId || body.id || "",
      ).trim();
      if (!libraryId) {
        return c.json({ error: "Library id is required", success: false }, 400);
      }

      // 无校验：不查用户是否已拥有该品种，直接创建新认领记录
      const libraryItem = await deps.kv.get(`library:${libraryId}`);
      const plantKey = `plant:${libraryId}-${Date.now()}`;
      const newPlant = buildAdoptedPlant({
        libraryItem,
        requestBody: body,
        user,
        plantKey,
      });

      const falKey = Deno.env.get("FAL_KEY")?.trim();
      if (!falKey) {
        return c.json(
          {
            success: false,
            error: "ADOPTION_UNAVAILABLE",
            message: "认领功能暂未就绪：请配置卡通形象生成服务后再试。",
          },
          503,
        );
      }

      let cartoonUrl: string | null = null;
      try {
        const species = libraryItem?.species ?? libraryItem?.name ?? newPlant.species ?? "";
        const type = libraryItem?.type ?? newPlant.type ?? body?.type ?? "";
        const customPrompt = libraryItem?.customPrompt ?? body?.customPrompt;
        cartoonUrl = await generatePlantCartoonImage(falKey, {
          plantName: species,
          plantType: type,
          customPrompt,
        });
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        console.error("Adopt: fal cartoon generation failed, fallback to library image:", errMessage);
      }

      if (!cartoonUrl || cartoonUrl.trim().length === 0) {
        const fallbackImage = (
          libraryItem?.imageUrl ??
          libraryItem?.image ??
          libraryItem?.coverImage ??
          body?.imageUrl ??
          body?.image
        );
        if (typeof fallbackImage === "string" && fallbackImage.trim().length > 0) {
          cartoonUrl = fallbackImage.trim();
          console.warn("Adopt: using fallback image for plant", newPlant.id);
        }
      }

      if (!cartoonUrl || cartoonUrl.trim().length === 0) {
        return c.json(
          {
            success: false,
            error: "CARTOON_GENERATION_FAILED",
            message: "植物卡通形象生成失败，且无可用兜底图片。",
          },
          502,
        );
      }

      newPlant.cartoonImageUrl = cartoonUrl;
      await deps.kv.set(plantKey, newPlant);
      await deps.updateUserStats(user.id, "plants", 1);

      return c.json({ ...newPlant, success: true });
    } catch (err: any) {
      return c.json({
        error: "Failed to adopt plant",
        details: err.message,
        success: false,
      }, 400);
    }
  });

  return plants;
}
