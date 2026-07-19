/** Primary educator account — can toggle admin/user view without a passcode. */
export const PRIMARY_ADMIN_EMAIL = "sheethappenwithjaa@gmail.com";

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

const VIEW_MODE_KEY = "edmessenger.adminViewMode";

export type AdminViewMode = "admin" | "user";

export function getStoredAdminViewMode(): AdminViewMode {
  if (typeof window === "undefined") return "admin";
  return window.localStorage.getItem(VIEW_MODE_KEY) === "user" ? "user" : "admin";
}

export function setStoredAdminViewMode(mode: AdminViewMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEW_MODE_KEY, mode);
}
