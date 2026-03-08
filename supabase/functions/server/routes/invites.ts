import { Hono } from "npm:hono";

interface InviteRouteDeps {
  getUser: (c: any) => Promise<any>;
  updateUserStats: (userId: string, type: "posts" | "likes" | "comments" | "water" | "fertilizer" | "plants" | "streak" | "exp" | "sync", increment?: number, forceValues?: any) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    del: (key: string) => Promise<void>;
  };
}

export function createInviteRoutes(deps: InviteRouteDeps) {
  const invites = new Hono();

  invites.post("/generate-invite", async (c) => {
    try {
      const { plantId, inviterId, inviterName } = await c.req.json();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const data = { code, plantId, inviterId, inviterName, timestamp: new Date().toISOString() };
      await deps.kv.set(`invite:${code}`, data);
      return c.json({ success: true, code });
    } catch (err: any) {
      return c.json({ error: "Failed to generate invite", details: err.message }, 400);
    }
  });

  invites.post("/accept-invite", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const { inviteCode, userName } = await c.req.json();
      const data = await deps.kv.get(`invite:${inviteCode?.toUpperCase()}`);
      if (!data) return c.json({ error: "Invalid invite code" }, 404);
      const plant = await deps.kv.get(data.plantId);
      if (!plant) return c.json({ error: "Plant not found" }, 404);

      if (!plant.ownerEmails) plant.ownerEmails = [];
      if (!plant.owners) plant.owners = [];
      if (!plant.ownerIds) plant.ownerIds = [];

      if (!plant.ownerEmails.includes(user.email)) {
        const userEmail = user.email || "";
        plant.owners.push(userName || user.user_metadata?.name || userEmail.split("@")[0] || "用户");
        plant.ownerEmails.push(userEmail);
        plant.ownerIds.push(user.id);

        await deps.kv.set(data.plantId, plant);
        await deps.updateUserStats(user.id, "plants", 1);
      }

      const userEmail = (user.email || "").toLowerCase();
      await deps.kv.del(`notification:${userEmail}:${inviteCode?.toUpperCase()}`);

      return c.json({ success: true, plant });
    } catch (err: any) {
      return c.json({ error: "Failed to accept invite", details: err.message }, 400);
    }
  });

  invites.post("/send-direct-invite", async (c) => {
    try {
      const { plantId, inviterId, inviterName, targetEmail } = await c.req.json();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const timestamp = new Date().toISOString();

      await deps.kv.set(`invite:${code}`, { code, plantId, inviterId, inviterName, timestamp });

      const notificationId = `notification:${targetEmail.toLowerCase()}:${code}`;
      await deps.kv.set(notificationId, {
        id: notificationId,
        from: inviterName,
        inviteCode: code,
        timestamp,
      });

      return c.json({ success: true, code });
    } catch (err: any) {
      return c.json({ error: "Failed to send direct invite", details: err.message }, 400);
    }
  });

  return invites;
}
