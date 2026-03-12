import { Hono } from "npm:hono";

interface FollowRouteDeps {
  getUser: (c: any) => Promise<any>;
  kv: {
    get: (key: string) => Promise<any>;
    getByPrefix: (prefix: string) => Promise<any[]>;
    set: (key: string, value: any) => Promise<void>;
    del?: (key: string) => Promise<void>;
  };
  supabase?: any;
}

function buildFollowKey(followerId: string, targetUserId: string) {
  return `follow:${followerId}:${targetUserId}`;
}

function fallbackDisplayName(userId: string) {
  return `用户${userId.slice(0, 6)}`;
}

function resolveCurrentUserProfile(user: any) {
  const fallbackName = user?.email?.split("@")[0] || fallbackDisplayName(user?.id || "user");
  return {
    id: user?.id,
    name: user?.user_metadata?.name || fallbackName,
    avatar: user?.user_metadata?.avatar || fallbackName.slice(0, 1).toUpperCase(),
  };
}

async function resolveTargetProfile(
  deps: FollowRouteDeps,
  targetUserId: string,
) {
  let name = "";
  let avatar = "";
  let email = "";

  try {
    if (deps.supabase?.auth?.admin?.getUserById) {
      const { data, error } = await deps.supabase.auth.admin.getUserById(
        targetUserId,
      );
      if (!error && data?.user) {
        const targetUser = data.user;
        email = targetUser.email || "";
        name = targetUser.user_metadata?.name ||
          targetUser.email?.split("@")[0] || "";
        avatar = targetUser.user_metadata?.avatar || "";
      }
    }
  } catch (_e) {
    // ignore and fallback to KV-derived profile
  }

  if (!name || !avatar) {
    try {
      const profile = await deps.kv.get(`profile:${targetUserId}`);
      if (profile) {
        name = name || profile.name || "";
        avatar = avatar || profile.avatar || "";
      }
    } catch (_e) {
      // ignore
    }
  }

  if (!name || !avatar) {
    try {
      const moments = (await deps.kv.getByPrefix("moment:")) || [];
      const latestMoment = moments
        .filter((moment: any) => moment.userId === targetUserId)
        .sort((a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        )[0];

      if (latestMoment) {
        name = name || latestMoment.user || "";
        avatar = avatar || latestMoment.avatar || "";
      }
    } catch (_e) {
      // ignore
    }
  }

  return {
    id: targetUserId,
    name: name || fallbackDisplayName(targetUserId),
    avatar: avatar ||
      (name || fallbackDisplayName(targetUserId)).slice(0, 1).toUpperCase(),
    email,
  };
}

export function createFollowRoutes(deps: FollowRouteDeps) {
  const follow = new Hono();

  const handleFollow = async (c: any, targetUserIdInput?: string) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

      const body = targetUserIdInput ? null : await c.req.json().catch(() => ({}));
      const targetUserId = String(targetUserIdInput || body?.targetUserId || "").trim();
      if (!targetUserId) {
        return c.json(
          { success: false, error: "targetUserId is required" },
          400,
        );
      }
      if (targetUserId === user.id) {
        return c.json({ success: false, error: "Cannot follow yourself" }, 400);
      }

      const targetProfile = await resolveTargetProfile(deps, targetUserId);
      const currentProfile = resolveCurrentUserProfile(user);
      const key = buildFollowKey(user.id, targetUserId);
      const record = {
        id: key,
        followerId: user.id,
        followerName: currentProfile.name,
        followerAvatar: currentProfile.avatar,
        targetUserId,
        targetUserName: targetProfile.name,
        targetUserAvatar: targetProfile.avatar,
        timestamp: new Date().toISOString(),
      };

      await deps.kv.set(key, record);
      return c.json({
        success: true,
        isFollowing: true,
        follow: record,
        data: record,
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: "Failed to follow user",
        details: err.message,
      }, 400);
    }
  };

  follow.post("/follow", async (c) => handleFollow(c));
  follow.post("/follow/:userId", async (c) => handleFollow(c, String(c.req.param("userId") || "").trim()));

  follow.delete("/follow/:userId", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
      if (!deps.kv.del) {
        return c.json(
          { success: false, error: "KV delete is not available" },
          501,
        );
      }

      const targetUserId = String(c.req.param("userId") || "").trim();
      if (!targetUserId) {
        return c.json({ success: false, error: "userId is required" }, 400);
      }

      const key = buildFollowKey(user.id, targetUserId);
      const existing = await deps.kv.get(key);
      if (!existing) {
        return c.json({
          success: true,
          isFollowing: false,
          deleted: false,
          targetUserId,
          data: { targetUserId, deleted: false, isFollowing: false },
        });
      }

      await deps.kv.del(key);
      return c.json({
        success: true,
        isFollowing: false,
        deleted: true,
        targetUserId,
        data: { targetUserId, deleted: true, isFollowing: false },
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: "Failed to unfollow user",
        details: err.message,
      }, 500);
    }
  });

  follow.get("/is-following/:userId", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const targetUserId = String(c.req.param("userId") || "").trim();
      if (!targetUserId) return c.json({ error: "userId is required" }, 400);
      if (targetUserId === user.id) {
        return c.json({
          success: true,
          isFollowing: false,
          targetUserId,
          self: true,
          data: { isFollowing: false, targetUserId, self: true },
        });
      }

      const existing = await deps.kv.get(buildFollowKey(user.id, targetUserId));
      return c.json({
        success: true,
        isFollowing: Boolean(existing),
        targetUserId,
        data: { isFollowing: Boolean(existing), targetUserId },
      });
    } catch (err: any) {
      return c.json({
        error: "Failed to fetch follow status",
        details: err.message,
      }, 500);
    }
  });

  follow.get("/following", async (c) => {
    try {
      const user = await deps.getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const follows = ((await deps.kv.getByPrefix(`follow:${user.id}:`)) || [])
        .sort((a: any, b: any) =>
          new Date(b.timestamp || 0).getTime() -
          new Date(a.timestamp || 0).getTime()
        );

      return c.json({
        success: true,
        items: follows,
        following: follows,
        total: follows.length,
      });
    } catch (err: any) {
      return c.json({
        error: "Failed to fetch following list",
        details: err.message,
      }, 500);
    }
  });

  return follow;
}
