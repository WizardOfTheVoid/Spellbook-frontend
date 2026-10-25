export type AdminIdentity = { displayName?: string | null, username?: string | null }

export const adminDisplayNameMinLength = 3

export function getAdminName(admin: AdminIdentity | null | undefined, fallback = `Unknown admin`): string {
  const displayName = admin?.displayName?.trim() ?? ``
  return displayName.length >= adminDisplayNameMinLength ? displayName : admin?.username?.trim() || fallback
}
