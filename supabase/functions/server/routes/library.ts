import { Hono } from "npm:hono";

interface LibraryRouteDeps {
  getUser: (c: any) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
    del?: (key: string) => Promise<void>;
  };
}

function isAdminUser(user: any) {
  const userEmail = user?.email?.toLowerCase?.();
  return user?.user_metadata?.role === "admin" || userEmail === "776427024@qq.com";
}

function requireAdmin(user: any) {
  if (!user) return { status: 401, body: { error: "Unauthorized", success: false } };
  if (!isAdminUser(user)) return { status: 403, body: { error: "Forbidden", success: false } };
  return null;
}

function toLibraryKey(id: string) {
  return id.startsWith("library:") ? id : `library:${id}`;
}

export function createLibraryRoutes(deps: LibraryRouteDeps) {
  const library = new Hono();

  library.get("/library", async (c) => {
    try {
      const items = await deps.kv.getByPrefix("library:");
      return c.json(items || []);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch library", details: err.message }, 500);
    }
  });

  library.post("/library", async (c) => {
    try {
      const user = await deps.getUser(c);
      const authError = requireAdmin(user);
      if (authError) return c.json(authError.body, authError.status as 401 | 403);

      const data = await c.req.json();
      if (!data.id) data.id = `p${Date.now()}`;
      if (!data.addedDate) data.addedDate = new Date().toISOString().split("T")[0];
      await deps.kv.set(toLibraryKey(String(data.id)), data);
      return c.json({ ...data, success: true });
    } catch (err: any) {
      return c.json({ error: "Failed to save library item", details: err.message, success: false }, 400);
    }
  });

  library.delete("/library/:id", async (c) => {
    try {
      const user = await deps.getUser(c);
      const authError = requireAdmin(user);
      if (authError) return c.json(authError.body, authError.status as 401 | 403);

      const id = c.req.param("id");
      if (!id) return c.json({ error: "Library id is required", success: false }, 400);
      if (!deps.kv.del) return c.json({ error: "KV delete is not available", success: false }, 501);

      const key = toLibraryKey(id);
      const existing = await deps.kv.get(key);
      if (!existing) return c.json({ error: "Library item not found", success: false }, 404);

      await deps.kv.del(key);
      return c.json({ success: true, deletedId: existing.id || id, deletedKey: key });
    } catch (err: any) {
      return c.json({ error: "Failed to delete library item", details: err.message, success: false }, 500);
    }
  });

  return library;
}
