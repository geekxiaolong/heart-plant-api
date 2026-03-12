import { Hono } from "npm:hono";

const KV_TABLE = "kv_store_4b732228";

interface AdminRouteDeps {
  getUser: (c: any) => Promise<any>;
  supabase?: any;
  kv: {
    getByPrefix: (prefix: string) => Promise<any[]>;
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    del?: (key: string) => Promise<void>;
  };
}

const sortByNewest = (items: any[] = [], fieldCandidates = ["timestamp", "created_at"]) =>
  [...items].sort((a: any, b: any) => {
    const getTime = (item: any) => {
      for (const field of fieldCandidates) {
        if (item?.[field]) return new Date(item[field]).getTime();
      }
      return 0;
    };
    return getTime(b) - getTime(a);
  });

function isAdminUser(user: any) {
  if (!user) return false;
  const userEmail = user.email?.toLowerCase?.() || "";
  return user.user_metadata?.role === "admin" || userEmail === "776427024@qq.com";
}

function toPlantKey(id: string) {
  return id.startsWith("plant:") ? id : `plant:${id}`;
}

export function createAdminRoutes(deps: AdminRouteDeps) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const user = await deps.getUser(c);
    if (!user) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }
    if (!isAdminUser(user)) {
      return c.json({ success: false, error: "Forbidden" }, 403);
    }
    await next();
  });

  admin.get("/users", async (c) => {
    try {
      const plants = (await deps.kv.getByPrefix("plant:")) || [];
      const stats = (await deps.kv.getByPrefix("stats:")) || [];

      const userMap = new Map<string, any>();

      for (const plant of plants) {
        for (const email of plant.ownerEmails || []) {
          const key = String(email).toLowerCase();
          if (!userMap.has(key)) {
            userMap.set(key, {
              email: key,
              plantCount: 0,
              plants: [],
              stats: null,
            });
          }
          const user = userMap.get(key);
          user.plantCount += 1;
          user.plants.push({
            id: plant.id,
            name: plant.name,
            originalId: plant.originalId,
          });
        }
      }

      for (const stat of stats) {
        const key = String(stat.userId || "").toLowerCase();
        if (!key) continue;
        if (!userMap.has(key)) {
          userMap.set(key, {
            email: key,
            plantCount: 0,
            plants: [],
            stats: null,
          });
        }
        userMap.get(key).stats = stat;
      }

      return c.json({
        success: true,
        items: Array.from(userMap.values()).sort((a, b) => a.email.localeCompare(b.email)),
        total: userMap.size,
      });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin users", details: err.message }, 500);
    }
  });

  admin.get("/plants", async (c) => {
    try {
      const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
      const limit = Math.max(1, parseInt(c.req.query("limit") || "50") || 50);
      const plants = (await deps.kv.getByPrefix("plant:")) || [];
      const start = (page - 1) * limit;
      const end = start + limit;
      return c.json({
        success: true,
        items: plants.slice(start, end),
        total: plants.length,
      });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin plants", details: err.message }, 500);
    }
  });

  admin.get("/journals", async (c) => {
    try {
      const plantId = c.req.query("plantId");
      const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
      const limit = Math.max(1, parseInt(c.req.query("limit") || "50") || 50);
      const journals = sortByNewest((await deps.kv.getByPrefix("journal:")) || []);
      const items = plantId ? journals.filter((journal: any) => journal.plantId === plantId) : journals;
      const start = (page - 1) * limit;
      const end = start + limit;
      return c.json({ success: true, items: items.slice(start, end), total: items.length });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin journals", details: err.message }, 500);
    }
  });

  admin.get("/moments", async (c) => {
    try {
      const userId = c.req.query("userId");
      const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
      const limit = Math.max(1, parseInt(c.req.query("limit") || "50") || 50);
      const moments = sortByNewest((await deps.kv.getByPrefix("moment:")) || []);
      const items = userId ? moments.filter((moment: any) => moment.userId === userId) : moments;
      const start = (page - 1) * limit;
      const end = start + limit;
      return c.json({ success: true, items: items.slice(start, end), total: items.length });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin moments", details: err.message }, 500);
    }
  });

  admin.get("/stats/overview", async (c) => {
    try {
      const [plants, journals, moments, moods, stats] = await Promise.all([
        deps.kv.getByPrefix("plant:"),
        deps.kv.getByPrefix("journal:"),
        deps.kv.getByPrefix("moment:"),
        deps.kv.getByPrefix("mood:"),
        deps.kv.getByPrefix("stats:"),
      ]);

      const totalLikes = (moments || []).reduce((sum: number, moment: any) => sum + (moment.likes || 0), 0);
      const totalComments = (moments || []).reduce((sum: number, moment: any) => sum + (moment.comments || 0), 0);
      const activeUsers = new Set((plants || []).flatMap((plant: any) => plant.ownerEmails || [])).size;
      const recentJournals = sortByNewest(journals || []).slice(0, 5);
      const recentMoments = sortByNewest(moments || []).slice(0, 5);

      return c.json({
        success: true,
        overview: {
          plantCount: plants?.length || 0,
          journalCount: journals?.length || 0,
          momentCount: moments?.length || 0,
          moodCount: moods?.length || 0,
          statsCount: stats?.length || 0,
          activeUsers,
          totalLikes,
          totalComments,
        },
        recent: {
          journals: recentJournals,
          moments: recentMoments,
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin stats overview", details: err.message }, 500);
    }
  });

  admin.delete("/plants/:id", async (c) => {
    try {
      const id = c.req.param("id");
      if (!id) {
        return c.json({ success: false, error: "Plant id is required" }, 400);
      }

      const plantKey = toPlantKey(id);
      const plant = await deps.kv.get(plantKey);
      if (!plant) {
        return c.json({ success: false, error: "Plant not found" }, 404);
      }

      if (!deps.kv.del) {
        return c.json({ success: false, error: "KV delete is not available" }, 501);
      }

      await deps.kv.del(plantKey);
      return c.json({ success: true, deletedId: plant.id || id, deletedKey: plantKey });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to delete admin plant", details: err.message }, 500);
    }
  });

  /** 排查：名称与品种一致的认领植物（脏数据） */
  admin.get("/plants-dirty-report", async (c) => {
    try {
      const supabaseClient = deps.supabase;
      if (!supabaseClient) {
        return c.json({ success: false, error: "Supabase client not configured" }, 503);
      }
      const { data: plantRows } = await supabaseClient
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "plant:%");
      const { data: libraryRows } = await supabaseClient
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "library:%");
      const libById: Record<string, any> = {};
      for (const row of libraryRows || []) {
        const key = typeof row?.key === "string" ? row.key : "";
        const value = row?.value;
        const id = (value?.id != null ? String(value.id) : key.replace(/^library:/, "")).trim();
        if (id) libById[id] = value;
      }
      const resolveLibId = (value: any, key: string) => {
        let lid = (value.libraryId ?? value.originalId ?? value.sourcePlantId)?.toString().replace(/^library:/, "")?.trim();
        if (!lid && typeof key === "string" && key.startsWith("plant:")) {
          lid = key.replace(/^plant:/, "").split("-")[0]?.trim() || "";
        }
        return lid || "";
      };
      const items: { key: string; id: string; name: string; species: string; libraryId: string; librarySpecies: string }[] = [];
      for (const row of plantRows || []) {
        const key = row?.key;
        const value = row?.value;
        if (!key || !value || typeof value !== "object") continue;
        const storedName = String(value.name ?? value.plantName ?? "").trim();
        const storedSpecies = String(value.species ?? value.name ?? "").trim();
        if (!storedName || !storedSpecies || storedName !== storedSpecies) continue;
        const lid = resolveLibId(value, key);
        const lib = lid ? libById[lid] : null;
        const librarySpecies = lib ? String(lib.species ?? lib.name ?? "").trim() : "";
        items.push({
          key: String(key),
          id: String(value.id ?? value.plantId ?? key),
          name: storedName,
          species: storedSpecies,
          libraryId: lid,
          librarySpecies,
        });
      }
      return c.json({
        success: true,
        total: (plantRows || []).length,
        nameEqualsSpeciesCount: items.length,
        items,
      });
    } catch (err: any) {
      console.error("plants-dirty-report error:", err);
      return c.json({ success: false, error: err?.message || "Report failed" }, 500);
    }
  });

  /** 排查并修复指定账号的植物品种：将「错误」品种统一改为指定默认值（默认向日葵） */
  admin.post("/fix-user-plant-species", async (c) => {
    try {
      const supabaseClient = deps.supabase;
      if (!supabaseClient) {
        return c.json({ success: false, error: "Supabase client not configured" }, 503);
      }
      const body = await c.req.json().catch(() => ({}));
      const email = String(body?.email ?? "").trim().toLowerCase();
      const defaultSpecies = String(body?.defaultSpecies ?? "向日葵").trim() || "向日葵";
      if (!email) {
        return c.json({ success: false, error: "email is required" }, 400);
      }

      const { data: plantRows } = await supabaseClient
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "plant:%");
      const { data: libraryRows } = await supabaseClient
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "library:%");

      const libById: Record<string, any> = {};
      for (const row of libraryRows || []) {
        const key = typeof row?.key === "string" ? row.key : "";
        const value = row?.value;
        const id = (value?.id != null ? String(value.id) : key.replace(/^library:/, "")).trim();
        if (id) libById[id] = value;
      }
      const resolveLibId = (value: any, key: string) => {
        let lid = (value.libraryId ?? value.originalId ?? value.sourcePlantId)?.toString().replace(/^library:/, "")?.trim();
        if (!lid && typeof key === "string" && key.startsWith("plant:")) {
          lid = key.replace(/^plant:/, "").split("-")[0]?.trim() || "";
        }
        return lid || "";
      };

      const ownerEmails = (v: any) =>
        (v?.ownerEmails || []).map((e: string) => String(e).toLowerCase());
      const isOwner = (v: any) => ownerEmails(v).includes(email);

      const report: { key: string; id: string; name: string; species: string; libraryId: string; reason: string }[] = [];
      let fixed = 0;

      for (const row of plantRows || []) {
        const key = row?.key;
        const value = row?.value;
        if (!key || !value || typeof value !== "object" || !isOwner(value)) continue;

        const storedName = String(value.name ?? value.plantName ?? "").trim();
        const storedSpecies = String(value.species ?? value.name ?? "").trim();
        const lid = resolveLibId(value, key);
        const lib = lid ? libById[lid] : null;
        const librarySpecies = lib ? String(lib.species ?? lib.name ?? "").trim() : "";

        let wrong = false;
        let reason = "";
        if (!storedSpecies) {
          wrong = true;
          reason = "品种为空";
        } else if (librarySpecies && storedSpecies !== librarySpecies) {
          wrong = true;
          reason = `与植物库不一致(库: ${librarySpecies})`;
        } else if (storedName && storedName === storedSpecies) {
          wrong = true;
          reason = "名称与品种一致(脏数据)";
        }

        if (wrong) {
          report.push({
            key: String(key),
            id: String(value.id ?? value.plantId ?? key),
            name: storedName || "—",
            species: storedSpecies || "—",
            libraryId: lid,
            reason,
          });
          const next = { ...value, species: defaultSpecies };
          await deps.kv.set(key, next);
          fixed++;
        }
      }

      return c.json({
        success: true,
        email,
        defaultSpecies,
        fixed,
        report,
      });
    } catch (err: any) {
      console.error("fix-user-plant-species error:", err);
      return c.json({ success: false, error: err?.message || "Fix failed" }, 500);
    }
  });

  /** 修复植物脏数据：按植物库校正 species（品种）并补全 libraryId，写入 KV */
  admin.post("/fix-plant-species", async (c) => {
    try {
      const supabaseClient = deps.supabase;
      if (!supabaseClient) {
        return c.json({ success: false, error: "Supabase client not configured" }, 503);
      }
      const { data: plantRows } = await supabaseClient
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "plant:%");
      const { data: libraryRows } = await supabaseClient
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "library:%");
      const libById: Record<string, any> = {};
      for (const row of libraryRows || []) {
        const key = typeof row?.key === "string" ? row.key : "";
        const value = row?.value;
        const id = (value?.id != null ? String(value.id) : key.replace(/^library:/, "")).trim();
        if (id) libById[id] = value;
      }
      let fixed = 0;
      for (const row of plantRows || []) {
        const key = row?.key;
        const value = row?.value;
        if (!key || !value || typeof value !== "object") continue;
        let lid = (value.libraryId ?? value.originalId ?? value.sourcePlantId)?.toString().replace(/^library:/, "")?.trim();
        if (!lid && typeof key === "string" && key.startsWith("plant:")) {
          lid = key.replace(/^plant:/, "").split("-")[0]?.trim() || "";
        }
        const lib = lid ? libById[lid] : null;
        if (!lib) continue;
        const varietyFromLib = (lib.species ?? lib.name ?? "").toString().trim();
        if (!varietyFromLib) continue;
        const next = {
          ...value,
          species: varietyFromLib,
          libraryId: value.libraryId ?? lid,
          originalId: value.originalId ?? lid,
          sourcePlantId: value.sourcePlantId ?? lid,
        };
        await deps.kv.set(key, next);
        fixed++;
      }
      return c.json({ success: true, fixed, total: (plantRows || []).length });
    } catch (err: any) {
      console.error("fix-plant-species error:", err);
      return c.json({ success: false, error: err?.message || "Fix failed" }, 500);
    }
  });

  return admin;
}
