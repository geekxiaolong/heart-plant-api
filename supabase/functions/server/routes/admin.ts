import { Hono } from "npm:hono";

interface AdminRouteDeps {
  getUser: (c: any) => Promise<any>;
  kv: {
    getByPrefix: (prefix: string) => Promise<any[]>;
    get: (key: string) => Promise<any>;
    del?: (key: string) => Promise<void>;
    set?: (key: string, value: any) => Promise<void>;
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
      const plants = (await deps.kv.getByPrefix("plant:")) || [];
      return c.json({
        success: true,
        items: plants,
        total: plants.length,
      });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin plants", details: err.message }, 500);
    }
  });

  admin.get("/journals", async (c) => {
    try {
      const plantId = c.req.query("plantId");
      const limit = parseInt(c.req.query("limit") || "50");
      const journals = sortByNewest((await deps.kv.getByPrefix("journal:")) || []);
      const items = plantId ? journals.filter((journal: any) => journal.plantId === plantId) : journals;
      return c.json({ success: true, items: items.slice(0, limit), total: items.length });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to fetch admin journals", details: err.message }, 500);
    }
  });

  admin.get("/moments", async (c) => {
    try {
      const userId = c.req.query("userId");
      const limit = parseInt(c.req.query("limit") || "50");
      const moments = sortByNewest((await deps.kv.getByPrefix("moment:")) || []);
      const items = userId ? moments.filter((moment: any) => moment.userId === userId) : moments;
      return c.json({ success: true, items: items.slice(0, limit), total: items.length });
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

      const plant = await deps.kv.get(`plant:${id}`);
      if (!plant) {
        return c.json({ success: false, error: "Plant not found" }, 404);
      }

      if (!deps.kv.del) {
        return c.json({ success: false, error: "KV delete is not available" }, 501);
      }

      await deps.kv.del(`plant:${id}`);
      return c.json({ success: true, deletedId: id });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to delete admin plant", details: err.message }, 500);
    }
  });

  return admin;
}
