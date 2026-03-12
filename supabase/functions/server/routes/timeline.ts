import { Hono } from "npm:hono";
import {
  getPlantIdentifiers,
  normalizePlantRecord,
  pickFirstString,
  resolvePlantFromCollection,
} from "../lib/plant-mapper.ts";

interface TimelineRouteDeps {
  kv: {
    getByPrefix: (prefix: string) => Promise<any[]>;
  };
}

async function getTimelineScopedItems(
  deps: TimelineRouteDeps,
  prefix: string,
  rawIdentifier: string,
) {
  const normalizedIdentifier = pickFirstString(rawIdentifier);
  if (!normalizedIdentifier) return [];

  const allPlants = ((await deps.kv.getByPrefix("plant:")) || []).map(
    normalizePlantRecord,
  );
  const plant = resolvePlantFromCollection(allPlants, normalizedIdentifier);
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

export function createTimelineRoutes(deps: TimelineRouteDeps) {
  const timeline = new Hono();

  timeline.get("/plant-timeline/:plantId", async (c) => {
    try {
      const plantId = c.req.param("plantId");
      const page = parseInt(c.req.query("page") || "1");
      const limit = parseInt(c.req.query("limit") || "10");
      const offset = (page - 1) * limit;

      const [activities, moods, journals] = await Promise.all([
        getTimelineScopedItems(deps, "activity", plantId),
        getTimelineScopedItems(deps, "mood", plantId),
        getTimelineScopedItems(deps, "journal", plantId),
      ]);

      const activityEvents = (activities || []).map((item: any) => ({
        ...item,
        type: "activity",
        timestamp: item.timestamp || item.created_at,
      }));
      const moodEvents = (moods || []).map((item: any) => ({
        ...item,
        type: "mood",
        timestamp: item.timestamp || item.created_at,
      }));
      const journalEvents = (journals || []).map((item: any) => ({
        ...item,
        type: "journal",
        timestamp: item.timestamp || item.created_at,
      }));

      const allEvents = [...activityEvents, ...moodEvents, ...journalEvents]
        .sort((a: any, b: any) => {
          const timeA = new Date(a.timestamp || 0).getTime();
          const timeB = new Date(b.timestamp || 0).getTime();
          return timeB - timeA;
        });

      const total = allEvents.length;
      const items = allEvents.slice(offset, offset + limit);

      return c.json({
        items,
        total,
        page,
        limit,
        hasMore: offset + limit < total,
      });
    } catch (err: any) {
      console.error("Error fetching plant timeline:", err);
      return c.json(
        { error: "Failed to fetch timeline", details: err.message },
        500,
      );
    }
  });

  return timeline;
}
