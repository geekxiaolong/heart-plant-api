import { Hono } from "npm:hono";

interface PlantsRouteDeps {
  getUser: (c: any) => Promise<any>;
  updateUserStats: (userId: string, type: "posts" | "likes" | "comments" | "water" | "fertilizer" | "plants" | "streak" | "exp" | "sync", increment?: number, forceValues?: any) => Promise<any>;
  kv: {
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
  };
}

function isAdminUser(user: any) {
  const userEmail = user?.email?.toLowerCase?.();
  return user?.user_metadata?.role === "admin" || userEmail === "776427024@qq.com";
}

export function createPlantRoutes(deps: PlantsRouteDeps) {
  const plants = new Hono();

  plants.get("/plants", async (c) => {
    try {
      const user = await deps.getUser(c);
      const allPlants = (await deps.kv.getByPrefix("plant:")) || [];
      const isAdminView = c.req.query("admin_view") === "true";

      if (!user) return c.json([]);

      const userEmail = user.email?.toLowerCase();
      if (isAdminUser(user) && isAdminView) return c.json(allPlants);

      const userPlants = allPlants.filter((p: any) =>
        p.ownerEmails?.some((e: string) => e.toLowerCase() === userEmail)
      );
      return c.json(userPlants);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch plants", details: err.message }, 500);
    }
  });

  plants.post("/adopt", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json();
      const libraryId = body.id;
      const userEmail = user.email?.toLowerCase();
      const allPlants = (await deps.kv.getByPrefix("plant:")) || [];
      const alreadyAdopted = allPlants.find((p: any) =>
        p.originalId === libraryId &&
        p.ownerEmails?.some((e: string) => e.toLowerCase() === userEmail)
      );

      if (alreadyAdopted) {
        return c.json({
          success: false,
          error: "DUPLICATE_ADOPTION",
          message: `你已经拥有「${alreadyAdopted.name}」了，快去空间看看它吧 ✨`,
          plantId: alreadyAdopted.id,
        }, 400);
      }

      const id = libraryId || Date.now();
      const plantKey = `plant:${id}-${Date.now()}`;
      const newPlant = {
        ...body,
        id: plantKey,
        originalId: libraryId,
        ownerEmails: [user.email],
        ownerIds: [user.id],
        created_at: new Date().toISOString(),
      };
      await deps.kv.set(plantKey, newPlant);
      await deps.updateUserStats(user.id, "plants", 1);

      return c.json({ ...newPlant, success: true });
    } catch (err: any) {
      return c.json({ error: "Failed to adopt plant", details: err.message, success: false }, 400);
    }
  });

  return plants;
}
