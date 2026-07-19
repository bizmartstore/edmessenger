import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  bindPushIdentity,
  ensurePushSubscription,
  identifyOneSignalUser,
  initOneSignal,
  logoutOneSignal,
} from "@/lib/onesignal";

const RELOAD_ONCE_KEY = "edmessenger.onesignal.reloadOnce.v4";

/**
 * The ONLY push notification bootstrap in the app.
 * - Inits OneSignal once
 * - Tags the signed-in user (student/admin)
 * - Automatically shows the Allow-notifications prompt on open
 */
export function PushNotifications() {
  const { user, isAdmin, session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    (async () => {
      await initOneSignal();
      if (cancelled) return;

      if (!user) {
        await logoutOneSignal();
        return;
      }

      const role = isAdmin ? "admin" : "student";
      await identifyOneSignalUser(user.id, role);
      if (cancelled) return;

      const ok = await ensurePushSubscription();
      if (cancelled) return;

      // Link subscription → external_id + role tag (needed for DM / admin targeting)
      if (ok) {
        await bindPushIdentity(user.id, role);
        try {
          localStorage.removeItem(RELOAD_ONCE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      // Permission granted but token empty → SW was broken. Reload once after reset.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          if (localStorage.getItem(RELOAD_ONCE_KEY) !== "1") {
            localStorage.setItem(RELOAD_ONCE_KEY, "1");
            window.location.reload();
          }
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, session?.access_token, loading]);

  return null;
}
