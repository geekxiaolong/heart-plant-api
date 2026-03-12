import { resolveUserRole } from "./role.ts";

function isMissingTableError(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();

  return code === "42P01" || code === "PGRST205" ||
    message.includes("relation") && message.includes("does not exist") ||
    details.includes("could not find the table");
}

async function getDbProfile(supabase: any, userId: string) {
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, avatar, bio, location")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return null;
      console.warn("getDbProfile error:", error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.warn("getDbProfile exception:", err);
    return null;
  }
}

async function getDbUserRole(supabase: any, userId: string) {
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return null;
      console.warn("getDbUserRole error:", error.message);
      return null;
    }

    return data?.role || null;
  } catch (err) {
    console.warn("getDbUserRole exception:", err);
    return null;
  }
}

async function upsertDbProfile(supabase: any, profileRecord: Record<string, any>) {
  if (!supabase || !profileRecord?.id) {
    return { synced: false, missingTable: false };
  }

  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: profileRecord.id,
        email: profileRecord.email || "",
        name: profileRecord.name || "",
        avatar: profileRecord.avatar || "",
        bio: profileRecord.bio || "",
        location: profileRecord.location || "",
      });

    if (!error) {
      return { synced: true, missingTable: false };
    }

    if (isMissingTableError(error)) {
      return { synced: false, missingTable: true };
    }

    console.warn("profiles upsert failed, falling back to auth+kv only:", error.message);
    return { synced: false, missingTable: false, error };
  } catch (err) {
    console.warn("profiles upsert exception, falling back to auth+kv only:", err);
    return { synced: false, missingTable: false, error: err };
  }
}

export function buildDefaultProfile(user: any) {
  const metadata = (user?.user_metadata || {}) as Record<string, any>;
  const fallbackName = user?.email?.split("@")[0] || "用户";

  return {
    id: user?.id,
    email: user?.email || "",
    name: metadata.name || fallbackName,
    avatar: metadata.avatar || "",
    bio: metadata.bio || "",
    location: metadata.location || "",
    role: resolveUserRole(user),
  };
}

export async function getProfileOverrides(kv: any, userId: string) {
  try {
    return (await kv.get(`profile:${userId}`)) || null;
  } catch (err) {
    console.error("getProfileOverrides error:", err);
    return null;
  }
}

export async function buildUserProfile(kv: any, user: any, supabase?: any) {
  const baseProfile = buildDefaultProfile(user);
  const [dbProfile, dbRole, overrides] = await Promise.all([
    user?.id ? getDbProfile(supabase, user.id) : null,
    user?.id ? getDbUserRole(supabase, user.id) : null,
    user?.id ? getProfileOverrides(kv, user.id) : null,
  ]);

  const profileFromDb = dbProfile
    ? {
      id: user?.id,
      email: dbProfile.email || user?.email || baseProfile.email,
      name: dbProfile.name || baseProfile.name,
      avatar: dbProfile.avatar || baseProfile.avatar,
      bio: dbProfile.bio || baseProfile.bio,
      location: dbProfile.location || baseProfile.location,
      role: resolveUserRole(user, dbRole ? { role: dbRole } : null),
    }
    : baseProfile;

  return {
    ...profileFromDb,
    ...(overrides || {}),
    id: user?.id,
    email: user?.email || profileFromDb.email,
    role: dbRole || resolveUserRole(user, overrides || dbProfile),
  };
}

export async function updateUserProfile(
  kv: any,
  user: any,
  body: any,
  supabase?: any,
) {
  const metadata = (user?.user_metadata || {}) as Record<string, any>;
  const nextName = String(
    body?.name || metadata.name || user?.email?.split("@")[0] || "",
  ).trim();
  const nextBio = String(body?.bio || "").trim();
  const nextLocation = String(body?.location || "").trim();
  const nextAvatar = String(body?.avatar || "").trim();

  if (!nextName) {
    return {
      ok: false,
      status: 400,
      body: { error: "name is required" },
    };
  }

  const nextMetadata: Record<string, any> = {
    ...metadata,
    name: nextName,
    bio: nextBio,
    location: nextLocation,
    avatar: nextAvatar,
  };

  let updatedUser = user;
  let authUpdated = false;

  if (supabase?.auth?.admin?.updateUserById) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: nextMetadata,
      },
    );

    if (!error && data?.user) {
      updatedUser = data.user;
      authUpdated = true;
    } else if (error) {
      console.warn(
        "profile auth metadata update failed, falling back to KV override:",
        error.message,
      );
    }
  }

  const profileRecord = {
    id: user.id,
    email: user.email || "",
    name: nextName,
    bio: nextBio,
    location: nextLocation,
    avatar: nextAvatar,
    role: resolveUserRole(user, nextMetadata),
    updated_at: new Date().toISOString(),
    source: authUpdated ? "auth+kv" : "kv",
  };

  const dbSync = await upsertDbProfile(supabase, profileRecord);

  await kv.set(`profile:${user.id}`, profileRecord);

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      profile: {
        ...(await buildUserProfile(kv, updatedUser, supabase)),
        updated_at: profileRecord.updated_at,
      },
      authUpdated,
    },
    meta: {
      authUpdated,
      profileRecord,
      profileDbSynced: dbSync.synced,
      profileDbMissingTable: dbSync.missingTable,
    },
  };
}
