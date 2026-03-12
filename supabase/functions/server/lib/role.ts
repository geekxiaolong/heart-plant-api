export function resolveUserRole(user: any, profile?: Record<string, any> | null) {
  const metadataRole = user?.user_metadata?.role;
  const profileRole = profile?.role;
  const email = String(user?.email || "").toLowerCase();

  return profileRole || metadataRole ||
    (email === "776427024@qq.com" ? "admin" : "user");
}
