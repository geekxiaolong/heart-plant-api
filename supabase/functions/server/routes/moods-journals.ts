import { Hono } from "npm:hono";
import {
  getPlantIdentifiers,
  normalizePlantRecord,
  pickFirstString,
  resolvePlantFromCollection,
} from "../lib/plant-mapper.ts";

interface MoodJournalRouteDeps {
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
    del?: (key: string) => Promise<void>;
  };
}

const sortByTimestampDesc = (items: any[] = []) =>
  items.sort((a: any, b: any) =>
    new Date(b.timestamp || b.created_at || 0).getTime() -
    new Date(a.timestamp || a.created_at || 0).getTime()
  );

function isAdminUser(user: any) {
  const userEmail = user?.email?.toLowerCase?.();
  return user?.user_metadata?.role === "admin" ||
    userEmail === "776427024@qq.com";
}

function toJournalKey(id: string) {
  return id.startsWith("journal:") ? id : `journal:${id}`;
}

function toMoodKey(id: string) {
  return id.startsWith("mood:") ? id : `mood:${id}`;
}

async function resolveOwnedPlant(
  deps: MoodJournalRouteDeps,
  user: any,
  rawIdentifier: string,
) {
  const normalizedIdentifier = pickFirstString(rawIdentifier);
  if (!normalizedIdentifier) return null;

  const allPlants = ((await deps.kv.getByPrefix("plant:")) || []).map(
    normalizePlantRecord,
  );
  const plant = resolvePlantFromCollection(allPlants, normalizedIdentifier);
  if (!plant) return null;

  if (!user) return plant;

  const userEmail = user.email?.toLowerCase();
  const canAccess = isAdminUser(user) ||
    plant.ownerEmails?.some((e: string) => e.toLowerCase() === userEmail) ||
    plant.ownerIds?.includes(user.id);

  return canAccess ? plant : null;
}

async function getPlantScopedItems(
  deps: MoodJournalRouteDeps,
  prefix: string,
  rawIdentifier: string,
  user?: any,
) {
  const normalizedIdentifier = pickFirstString(rawIdentifier);
  if (!normalizedIdentifier) return [];

  const plant = await resolveOwnedPlant(deps, user, normalizedIdentifier);
  const scopedIdentifiers = plant
    ? getPlantIdentifiers(plant)
    : [normalizedIdentifier];

  const scopedItemGroups = await Promise.all(
    scopedIdentifiers.map((identifier) =>
      deps.kv.getByPrefix(`${prefix}:${identifier}:`)
    ),
  );
  const merged = scopedItemGroups.flat().filter(Boolean);

  return merged.filter((item, index, list) => {
    const itemId = item?.id || `${prefix}:${index}`;
    return list.findIndex((candidate) => (candidate?.id || "") === itemId) ===
      index;
  });
}

export function createMoodJournalRoutes(deps: MoodJournalRouteDeps) {
  const routes = new Hono();

  routes.post("/mood", async (c) => {
    try {
      const user = await deps.getUser(c);
      const { plantId, libraryId, originalId, mood, content, tags, timestamp } =
        await c.req.json();
      const requestedPlantId = pickFirstString(plantId, libraryId, originalId);
      if (!requestedPlantId) {
        return c.json({ error: "Plant id is required" }, 400);
      }

      const plant = await resolveOwnedPlant(deps, user, requestedPlantId);
      const resolvedPlantId = plant?.id || requestedPlantId;
      const moodId = `mood:${resolvedPlantId}:${Date.now()}`;
      const moodRecord = {
        id: moodId,
        plantId: resolvedPlantId,
        libraryId: plant?.libraryId || requestedPlantId,
        originalId: plant?.originalId || plant?.libraryId || requestedPlantId,
        mood,
        content,
        tags: tags || [],
        timestamp,
        created_at: new Date().toISOString(),
        userId: user?.id,
      };
      await deps.kv.set(moodId, moodRecord);

      if (user) {
        await deps.updateUserStats(user.id, "posts", 1);
      }

      return c.json(moodRecord);
    } catch (err: any) {
      return c.json(
        { error: "Failed to save mood", details: err.message },
        400,
      );
    }
  });

  routes.get("/mood/:plantId", async (c) => {
    const user = await deps.getUser(c);
    const plantId = c.req.param("plantId");
    const moods = await getPlantScopedItems(deps, "mood", plantId, user);
    return c.json(sortByTimestampDesc((moods || []).map((item: any) => ({
      ...item,
      plantId: item.plantId || plantId,
    }))));
  });

  routes.post("/journal", async (c) => {
    try {
      const user = await deps.getUser(c);
      const {
        plantId,
        libraryId,
        originalId,
        title,
        style,
        entries,
        timestamp,
      } = await c.req.json();
      const requestedPlantId = pickFirstString(plantId, libraryId, originalId);
      if (!requestedPlantId) {
        return c.json({ error: "Plant id is required" }, 400);
      }

      const plant = await resolveOwnedPlant(deps, user, requestedPlantId);
      const resolvedPlantId = plant?.id || requestedPlantId;
      const journalId = `journal:${resolvedPlantId}:${Date.now()}`;
      const journalRecord = {
        id: journalId,
        plantId: resolvedPlantId,
        libraryId: plant?.libraryId || requestedPlantId,
        originalId: plant?.originalId || plant?.libraryId || requestedPlantId,
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
      return c.json(
        { error: "Failed to save journal", details: err.message },
        400,
      );
    }
  });

  routes.get("/journal/:plantId", async (c) => {
    const user = await deps.getUser(c);
    const plantId = c.req.param("plantId");
    const journals = await getPlantScopedItems(deps, "journal", plantId, user);
    return c.json(sortByTimestampDesc((journals || []).map((item: any) => ({
      ...item,
      plantId: item.plantId || plantId,
    }))));
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
      return c.json({
        error: "Failed to fetch journal detail",
        details: err.message,
      }, 500);
    }
  }

  routes.get("/journal-detail/:id", getJournalDetailResponse);
  routes.get("/journal/:id/detail", getJournalDetailResponse);

  routes.post("/journal-feature/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
      if (!isAdminUser(user)) {
        return c.json({ success: false, error: "Forbidden" }, 403);
      }

      const id = c.req.param("id");
      const key = toJournalKey(id);
      const journal = await deps.kv.get(key);
      if (!journal) {
        return c.json({ success: false, error: "Journal not found" }, 404);
      }
      if (!deps.kv.set) {
        return c.json(
          { success: false, error: "KV set is not available" },
          501,
        );
      }

      const nextJournal = {
        ...journal,
        isFeatured: !Boolean(journal.isFeatured),
        featuredAt: !journal.isFeatured ? new Date().toISOString() : null,
      };
      await deps.kv.set(key, nextJournal);
      return c.json({
        success: true,
        isFeatured: nextJournal.isFeatured,
        item: nextJournal,
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: "Failed to toggle journal feature",
        details: err.message,
      }, 500);
    }
  });

  routes.delete("/journal/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
      if (!isAdminUser(user)) {
        return c.json({ success: false, error: "Forbidden" }, 403);
      }
      if (!deps.kv.del) {
        return c.json(
          { success: false, error: "KV delete is not available" },
          501,
        );
      }

      const id = c.req.param("id");
      const key = toJournalKey(id);
      const journal = await deps.kv.get(key);
      if (!journal) {
        return c.json({ success: false, error: "Journal not found" }, 404);
      }

      await deps.kv.del(key);
      return c.json({
        success: true,
        deletedId: journal.id || id,
        deletedKey: key,
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: "Failed to delete journal",
        details: err.message,
      }, 500);
    }
  });

  routes.get("/mood-detail/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const mood = await deps.kv.get(id) || await deps.kv.get(toMoodKey(id));
      if (!mood) return c.json({ error: "Mood not found" }, 404);
      return c.json(mood);
    } catch (err: any) {
      return c.json({
        error: "Failed to fetch mood detail",
        details: err.message,
      }, 500);
    }
  });

  return routes;
}
