import { Hono } from "npm:hono";

interface MoodJournalRouteDeps {
  getUser: (c: any) => Promise<any>;
  updateUserStats: (userId: string, type: "posts" | "likes" | "comments" | "water" | "fertilizer" | "plants" | "streak" | "exp" | "sync", increment?: number, forceValues?: any) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
  };
}

const sortByTimestampDesc = (items: any[] = []) =>
  items.sort((a: any, b: any) => new Date(b.timestamp || b.created_at || 0).getTime() - new Date(a.timestamp || a.created_at || 0).getTime());

export function createMoodJournalRoutes(deps: MoodJournalRouteDeps) {
  const routes = new Hono();

  routes.post("/mood", async (c) => {
    try {
      const user = await deps.getUser(c);
      const { plantId, mood, content, tags, timestamp } = await c.req.json();
      const moodId = `mood:${plantId}:${Date.now()}`;
      const moodRecord = { id: moodId, plantId, mood, content, tags: tags || [], timestamp, created_at: new Date().toISOString(), userId: user?.id };
      await deps.kv.set(moodId, moodRecord);

      if (user) {
        await deps.updateUserStats(user.id, "posts", 1);
      }

      return c.json(moodRecord);
    } catch (err: any) {
      return c.json({ error: "Failed to save mood", details: err.message }, 400);
    }
  });

  routes.get("/mood/:plantId", async (c) => {
    const plantId = c.req.param("plantId");
    const moods = await deps.kv.getByPrefix(`mood:${plantId}:`);
    return c.json(sortByTimestampDesc(moods || []));
  });

  routes.post("/journal", async (c) => {
    try {
      const user = await deps.getUser(c);
      const { plantId, title, style, entries, timestamp } = await c.req.json();
      const journalId = `journal:${plantId}:${Date.now()}`;
      const journalRecord = { id: journalId, plantId, title, style, entries, timestamp, created_at: new Date().toISOString(), userId: user?.id };
      await deps.kv.set(journalId, journalRecord);

      if (user) {
        await deps.updateUserStats(user.id, "posts", 1);
      }

      return c.json(journalRecord);
    } catch (err: any) {
      return c.json({ error: "Failed to save journal", details: err.message }, 400);
    }
  });

  routes.get("/journal/:plantId", async (c) => {
    const plantId = c.req.param("plantId");
    const journals = await deps.kv.getByPrefix(`journal:${plantId}:`);
    return c.json(sortByTimestampDesc(journals || []));
  });

  routes.get("/all-journals", async (c) => {
    const journals = await deps.kv.getByPrefix("journal:");
    return c.json(sortByTimestampDesc(journals || []));
  });

  routes.get("/journal-detail/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const journal = await deps.kv.get(id);
      if (!journal) return c.json({ error: "Journal not found" }, 404);
      return c.json(journal);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch journal detail", details: err.message }, 500);
    }
  });

  routes.get("/mood-detail/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const mood = await deps.kv.get(id);
      if (!mood) return c.json({ error: "Mood not found" }, 404);
      return c.json(mood);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch mood detail", details: err.message }, 500);
    }
  });

  return routes;
}
