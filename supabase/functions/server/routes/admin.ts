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
