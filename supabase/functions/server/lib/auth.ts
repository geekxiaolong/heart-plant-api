type GetUserDeps = {
  supabase: any;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  devAdminBypassToken?: string;
};

export function getRequestToken(c: any) {
  let token = c.req.header("X-User-JWT");

  if (!token) {
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      const parts = authHeader.split(" ");
      token = parts.length === 2 && parts[0].toLowerCase() === "bearer"
        ? parts[1]
        : authHeader;
    }
  }

  return token?.trim() || null;
}

export async function getUserFromRequest(c: any, deps: GetUserDeps) {
  try {
    const token = getRequestToken(c);

    if (!token) {
      console.log("No token provided");
      return null;
    }

    if (deps.devAdminBypassToken && token === deps.devAdminBypassToken.trim()) {
      return {
        id: "dev-admin",
        email: "776427024@qq.com",
        user_metadata: { role: "admin", name: "Local Dev Admin" },
      };
    }

    if (token === deps.supabaseAnonKey || token === deps.supabaseServiceRoleKey) {
      return null;
    }

    const parts = token.split(".");
    if (token.length < 50 || parts.length !== 3) {
      console.log("Skipping auth: token is invalid JWT format or not a user token");
      return null;
    }

    try {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (!payload?.sub) {
        console.log(
          "Skipping auth: JWT is valid but missing 'sub' claim (likely anon/service key)",
        );
        return null;
      }
    } catch (_e) {
      console.log("Skipping auth: Could not parse JWT payload");
      return null;
    }

    console.log("Attempting to verify user token...");
    const { data: { user }, error } = await deps.supabase.auth.getUser(token);
    if (error) {
      console.error("Auth error:", error.message);
      return null;
    }
    if (!user) {
      console.log("No user found for token");
      return null;
    }

    console.log("User authenticated:", user.email);
    return user;
  } catch (err) {
    console.error("getUserFromRequest error:", err);
    return null;
  }
}
