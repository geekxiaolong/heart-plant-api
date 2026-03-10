import { Hono } from "npm:hono";

interface MomentsRouteDeps {
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
  };
  supabase?: any;
}

export function createMomentRoutes(deps: MomentsRouteDeps) {
  const moments = new Hono();

  function fallbackDisplayName(userId: string) {
    return `用户${userId.slice(0, 6)}`;
  }

  async function resolveUserProfile(deps: MomentsRouteDeps, userId: string) {
    const kvProfile = (await deps.kv.get(`profile:${userId}`)) || null;
    let authProfile: any = null;

    try {
      if (deps.supabase?.auth?.admin?.getUserById) {
        const { data, error } = await deps.supabase.auth.admin.getUserById(
          userId,
        );
        if (!error && data?.user) {
          authProfile = data.user;
        }
      }
    } catch (_err) {
      // ignore and fallback to KV / moments-derived values
    }

    const fallbackName = authProfile?.email?.split("@")[0] ||
      fallbackDisplayName(userId);
    return {
      id: userId,
      name: kvProfile?.name || authProfile?.user_metadata?.name || fallbackName,
      avatar: kvProfile?.avatar || authProfile?.user_metadata?.avatar || "",
      bio: kvProfile?.bio || authProfile?.user_metadata?.bio || "",
      location: kvProfile?.location || authProfile?.user_metadata?.location ||
        "",
    };
  }

  moments.get("/moments", async (c) => {
    const items = await deps.kv.getByPrefix("moment:");
    return c.json(
      (items || []).sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      ),
    );
  });

  moments.get("/public/profile/:userId", async (c) => {
    try {
      const userId = String(c.req.param("userId") || "").trim();
      if (!userId) return c.json({ success: false, error: "userId is required" }, 400);

      const profile = await resolveUserProfile(deps, userId);
      return c.json({
        success: true,
        profile,
        data: profile,
        userId,
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: "Failed to fetch public profile",
        details: err.message,
      }, 500);
    }
  });

  moments.get("/profile/:userId", async (c) => {
    try {
      const userId = String(c.req.param("userId") || "").trim();
      if (!userId) return c.json({ success: false, error: "userId is required" }, 400);

      const profile = await resolveUserProfile(deps, userId);
      return c.json({
        success: true,
        profile,
        data: profile,
        userId,
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: "Failed to fetch public profile",
        details: err.message,
      }, 500);
    }
  });

  moments.get("/moments/user/:userId", async (c) => {
    try {
      const userId = String(c.req.param("userId") || "").trim();
      if (!userId) return c.json({ error: "userId is required" }, 400);

      const items = (await deps.kv.getByPrefix("moment:")) || [];
      const profile = await resolveUserProfile(deps, userId);
      const userMoments = items
        .filter((item: any) => item?.userId === userId)
        .sort((a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        )
        .map((item: any) => ({
          ...item,
          user: profile.name || item.user || fallbackDisplayName(userId),
          avatar: profile.avatar || item.avatar ||
            (profile.name || item.user || fallbackDisplayName(userId)).slice(
              0,
              1,
            ).toUpperCase(),
        }));

      return c.json({
        success: true,
        items: userMoments,
        moments: userMoments,
        profile,
        total: userMoments.length,
      });
    } catch (err: any) {
      return c.json({
        error: "Failed to fetch user moments",
        details: err.message,
      }, 500);
    }
  });

  moments.post("/moments", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const body = await c.req.json();
      const momentId = `moment:${Date.now()}`;
      const displayName = user.user_metadata?.name || user.email.split("@")[0];
      const newMoment = {
        id: momentId,
        userId: user.id,
        user: displayName,
        avatar: displayName[0].toUpperCase(),
        content: body.content,
        image: body.image || "",
        tag: body.tag || "成长日志",
        likes: 0,
        comments: 0,
        created_at: new Date().toISOString(),
      };
      await deps.kv.set(momentId, newMoment);
      await deps.updateUserStats(user.id, "posts", 1);

      return c.json(newMoment);
    } catch (err: any) {
      return c.json(
        { error: "Failed to post moment", details: err.message },
        400,
      );
    }
  });

  moments.post("/moments/:id/like", async (c) => {
    const id = c.req.param("id");
    const moment = await deps.kv.get(id);
    if (!moment) return c.json({ error: "Not found" }, 404);
    moment.likes = (moment.likes || 0) + 1;
    await deps.kv.set(id, moment);

    if (moment.userId) {
      await deps.updateUserStats(moment.userId, "likes", 1);
    }

    return c.json(moment);
  });

  moments.get("/moments/:id/comments", async (c) => {
    const id = c.req.param("id");
    const comments = await deps.kv.getByPrefix(`comment:${id}:`);
    return c.json(
      (comments || []).sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      ),
    );
  });

  moments.post("/moments/:id/comments", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const momentId = c.req.param("id");
      const body = await c.req.json();
      const commentId = `comment:${momentId}:${Date.now()}`;
      const comment = {
        id: commentId,
        momentId,
        userId: user.id,
        user: user.user_metadata?.name || user.email.split("@")[0],
        content: body.content,
        created_at: new Date().toISOString(),
      };
      await deps.kv.set(commentId, comment);
      const moment = await deps.kv.get(momentId);
      if (moment) {
        moment.comments = (moment.comments || 0) + 1;
        await deps.kv.set(momentId, moment);
      }
      return c.json(comment);
    } catch (err: any) {
      return c.json(
        { error: "Failed to post comment", details: err.message },
        400,
      );
    }
  });

  return moments;
}
