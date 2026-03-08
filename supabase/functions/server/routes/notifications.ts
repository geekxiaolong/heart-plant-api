import { Hono } from "npm:hono";

interface NotificationRouteDeps {
  kv: {
    getByPrefix: (prefix: string) => Promise<any[]>;
  };
}

export function createNotificationRoutes(deps: NotificationRouteDeps) {
  const notifications = new Hono();

  notifications.get("/notifications/:email", async (c) => {
    try {
      const email = (c.req.param("email") || "").toLowerCase();
      const items = await deps.kv.getByPrefix(`notification:${email}:`);
      return c.json(items || []);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch notifications", details: err.message }, 500);
    }
  });

  notifications.get("/notifications/:email{.+$}", async (c) => {
    try {
      const email = (c.req.param("email") || "").toLowerCase();
      const items = await deps.kv.getByPrefix(`notification:${email}:`);
      return c.json(items || []);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch notifications", details: err.message }, 500);
    }
  });

  return notifications;
}
