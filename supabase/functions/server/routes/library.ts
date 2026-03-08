import { Hono } from "npm:hono";

interface LibraryRouteDeps {
  kv: {
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
  };
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
      const data = await c.req.json();
      if (!data.id) data.id = `p${Date.now()}`;
      if (!data.addedDate) data.addedDate = new Date().toISOString().split("T")[0];
      await deps.kv.set(`library:${data.id}`, data);
      return c.json(data);
    } catch (err: any) {
      return c.json({ error: "Failed to save library item", details: err.message }, 400);
    }
  });

  return library;
}
