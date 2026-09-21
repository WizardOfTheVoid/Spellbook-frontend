export type AdminIdentity = { displayName?: string | null, username?: string | null }

export function getAdminName(admin: AdminIdentity | null | undefined, fallback = `Unknown admin`): string {
  return admin?.displayName?.trim() || admin?.username?.trim() || fallback
}
