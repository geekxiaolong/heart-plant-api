import { Hono } from "npm:hono";
import { buildUserProfile, updateUserProfile } from "../lib/profile.ts";

export function createMeRoutes(deps: {
  getUser: (c: any) => Promise<any>;
  kv: any;
  supabase: any;
}) {
  const me = new Hono();

  me.get("/me", async (c) => {
    const user = await deps.getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json(await buildUserProfile(deps.kv, user, deps.supabase));
  });

  me.put("/me", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const result = await updateUserProfile(
        deps.kv,
        user,
        await c.req.json(),
        deps.supabase,
      );

      c.status(result.status as 200 | 400);
      return c.json(result.body);
    } catch (err: any) {
      console.error("PUT /me error:", err);
      return c.json(
        { error: "Failed to update profile", details: err.message },
        500,
      );
    }
  });

  return me;
}
