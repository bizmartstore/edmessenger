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
 * Background bootstrap only — no prompt UI.
 * The single "Enable notifications" UI lives in PushEnableBanner.
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

      // Silent only: never open a second prompt (banner owns that)
      const ok = await ensurePushSubscription();
      if (cancelled) return;

      if (ok) {
        await bindPushIdentity(user.id, role);
        try {
          localStorage.removeItem(RELOAD_ONCE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

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
