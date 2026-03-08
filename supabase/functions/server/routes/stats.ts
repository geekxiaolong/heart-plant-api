import { Hono } from "npm:hono";

interface StatsRouteDeps {
  getUser: (c: any) => Promise<any>;
  updateUserStats: (userId: string, type: "posts" | "likes" | "comments" | "water" | "fertilizer" | "plants" | "streak" | "exp" | "sync", increment?: number, forceValues?: any) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    getByPrefix: (prefix: string) => Promise<any[]>;
  };
}

export function createStatsRoutes(deps: StatsRouteDeps) {
  const stats = new Hono();

  stats.get("/following", async (c) => {
    const user = await deps.getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const follows = await deps.kv.getByPrefix(`follow:${user.id}:`);
    return c.json(follows || []);
  });

  stats.get("/stats/:userId", async (c) => {
    const userId = c.req.param("userId");
    const user = await deps.getUser(c);

    let currentStats = await deps.kv.get(`stats:${userId}`);
    const defaultStats = {
      userId,
      level: 1,
      exp: 0,
      totalPosts: 0,
      totalLikes: 0,
      totalComments: 0,
      waterCount: 0,
      fertilizerCount: 0,
      plantsAdopted: 0,
      loginStreak: 0,
      achievements: [],
    };

    currentStats = currentStats ? { ...defaultStats, ...currentStats } : defaultStats;

    if (user && user.id === userId) {
      try {
        let needsUpdate = false;
        const userEmail = user.email?.toLowerCase();

        const allPlants = (await deps.kv.getByPrefix("plant:")) || [];
        const userPlants = allPlants.filter((plant: any) => {
          const hasId = (plant.ownerIds || []).includes(userId);
          const hasEmail = userEmail && (plant.ownerEmails || []).some((email: string) => email.toLowerCase() === userEmail);
          return hasId || hasEmail;
        });
        if (userPlants.length !== currentStats.plantsAdopted) {
          currentStats.plantsAdopted = userPlants.length;
          needsUpdate = true;
        }

        const allMoments = (await deps.kv.getByPrefix("moment:")) || [];
        const userMoments = allMoments.filter((moment: any) => moment.userId === userId);
        const allMoods = (await deps.kv.getByPrefix("mood:")) || [];
        const userMoods = allMoods.filter((mood: any) => mood.userId === userId);
        const allJournals = (await deps.kv.getByPrefix("journal:")) || [];
        const userJournals = allJournals.filter((journal: any) => journal.userId === userId);

        const actualTotalPosts = userMoments.length + userMoods.length + userJournals.length;
        if (actualTotalPosts !== currentStats.totalPosts) {
          currentStats.totalPosts = actualTotalPosts;
          needsUpdate = true;
        }

        const actualTotalLikes = userMoments.reduce((sum: number, moment: any) => sum + (moment.likes || 0), 0);
        if (actualTotalLikes !== currentStats.totalLikes) {
          currentStats.totalLikes = actualTotalLikes;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await deps.updateUserStats(userId, "sync", 0, {
            plantsAdopted: currentStats.plantsAdopted,
            totalPosts: currentStats.totalPosts,
            totalLikes: currentStats.totalLikes,
          });
          currentStats = await deps.kv.get(`stats:${userId}`) || currentStats;
        }
      } catch (e) {
        console.error("[Stats Sync] Sanity check failed:", e);
      }
    }

    return c.json(currentStats);
  });

  return stats;
}
