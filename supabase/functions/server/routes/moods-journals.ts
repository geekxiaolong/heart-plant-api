import { Hono } from "npm:hono";

interface MoodJournalRouteDeps {
  getUser: (c: any) => Promise<any>;
  updateUserStats: (userId: string, type: "posts" | "likes" | "comments" | "water" | "fertilizer" | "plants" | "streak" | "exp" | "sync", increment?: number, forceValues?: any) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
    del?: (key: string) => Promise<void>;
  };
}

const sortByTimestampDesc = (items: any[] = []) =>
  items.sort((a: any, b: any) => new Date(b.timestamp || b.created_at || 0).getTime() - new Date(a.timestamp || a.created_at || 0).getTime());

function isAdminUser(user: any) {
  const userEmail = user?.email?.toLowerCase?.();
  return user?.user_metadata?.role === "admin" || userEmail === "776427024@qq.com";
}

function toJournalKey(id: string) {
  return id.startsWith("journal:") ? id : `journal:${id}`;
}

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
      const journalRecord = {
        id: journalId,
        plantId,
        title,
        style,
        entries,
        timestamp,
        created_at: new Date().toISOString(),
        userId: user?.id,
        isFeatured: false,
      };
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

  async function getJournalDetailResponse(c: any) {
    try {
      const id = c.req.param("id");
      const journal = await deps.kv.get(toJournalKey(id));
      if (!journal) return c.json({ error: "Journal not found" }, 404);
      return c.json(journal);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch journal detail", details: err.message }, 500);
    }
  }

  routes.get("/journal-detail/:id", getJournalDetailResponse);
  routes.get("/journal/:id/detail", getJournalDetailResponse);

  routes.post("/journal-feature/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
      if (!isAdminUser(user)) return c.json({ success: false, error: "Forbidden" }, 403);

      const id = c.req.param("id");
      const key = toJournalKey(id);
      const journal = await deps.kv.get(key);
      if (!journal) return c.json({ success: false, error: "Journal not found" }, 404);
      if (!deps.kv.set) return c.json({ success: false, error: "KV set is not available" }, 501);

      const nextJournal = {
        ...journal,
        isFeatured: !Boolean(journal.isFeatured),
        featuredAt: !journal.isFeatured ? new Date().toISOString() : null,
      };
      await deps.kv.set(key, nextJournal);
      return c.json({ success: true, isFeatured: nextJournal.isFeatured, item: nextJournal });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to toggle journal feature", details: err.message }, 500);
    }
  });

  routes.delete("/journal/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
      if (!isAdminUser(user)) return c.json({ success: false, error: "Forbidden" }, 403);
      if (!deps.kv.del) return c.json({ success: false, error: "KV delete is not available" }, 501);

      const id = c.req.param("id");
      const key = toJournalKey(id);
      const journal = await deps.kv.get(key);
      if (!journal) return c.json({ success: false, error: "Journal not found" }, 404);

      await deps.kv.del(key);
      return c.json({ success: true, deletedId: journal.id || id, deletedKey: key });
    } catch (err: any) {
      return c.json({ success: false, error: "Failed to delete journal", details: err.message }, 500);
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
