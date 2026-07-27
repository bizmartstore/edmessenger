import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { emitPushStatusChanged, logoutOneSignal, setupOneSignalForUser } from "@/lib/onesignal";
import { notifyRoleExcept } from "@/lib/push";

const OPEN_NOTIF_KEY = "edms_admin_open_notif_day";

function notifyAdminsOnAppOpen(userId: string, displayName: string) {
  if (typeof window === "undefined") return;
  // At most once per UTC day per user — avoids push spam / quota burn.
  const day = new Date().toISOString().slice(0, 10);
  const key = `${OPEN_NOTIF_KEY}:${userId}`;
  try {
    if (localStorage.getItem(key) === day) return;
    localStorage.setItem(key, day);
  } catch {
    /* private mode — still send once this session via memory below */
  }
  notifyRoleExcept(
    "admin",
    [userId],
    "Student opened EdMessenger",
    `${displayName} is online in the app`,
    "/admin/students",
  );
}

export function PushNotifications() {
  const { user, profile, isAdmin, loading } = useAuth();
  const wasSignedIn = useRef(false);
  const lastUserId = useRef<string | null>(null);
  const openedNotified = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (wasSignedIn.current) {
        wasSignedIn.current = false;
        lastUserId.current = null;
        openedNotified.current = null;
        void logoutOneSignal();
      }
      return;
    }

    const changed = lastUserId.current !== user.id;
    const role = isAdmin ? "admin" : "student";
    wasSignedIn.current = true;
    lastUserId.current = user.id;
    void setupOneSignalForUser(user.id, role)
      .then(() => {
        // Do not sync OneSignal tags on every session — login() identity
        // transfer routinely returns 409 and queued tag ops fail loudly.
        // Tags are written only when the user changes prefs (setNotifPref).
        if (changed) emitPushStatusChanged();
        // Admin-only: notify when a student opens the app (not when admin opens).
        if (!isAdmin) {
          const day = new Date().toISOString().slice(0, 10);
          const stamp = `${user.id}:${day}`;
          if (openedNotified.current !== stamp) {
            openedNotified.current = stamp;
            notifyAdminsOnAppOpen(user.id, profile?.full_name ?? "A student");
          }
        }
      })
      .catch(() => {});
  }, [user, profile?.full_name, isAdmin, loading]);

  // Re-check status when the tab comes back into focus so the UI never sits
  // on a stale banner after the user grants/revokes permission elsewhere.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") emitPushStatusChanged();
    };
    const onFocus = () => emitPushStatusChanged();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
