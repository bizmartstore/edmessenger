/** Primary educator accounts — can toggle admin/user without a passcode. */
export const PRIMARY_ADMIN_EMAILS = [
  "sheethappenswithjaa@gmail.com",
  "sheethappenwithjaa@gmail.com",
] as const;

/** @deprecated use PRIMARY_ADMIN_EMAILS — kept for readability */
export const PRIMARY_ADMIN_EMAIL = PRIMARY_ADMIN_EMAILS[0];

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return PRIMARY_ADMIN_EMAILS.some((a) => a === e);
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
