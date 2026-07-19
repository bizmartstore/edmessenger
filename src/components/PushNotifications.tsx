import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  ensurePushSubscription,
  identifyOneSignalUser,
  initOneSignal,
  logoutOneSignal,
} from "@/lib/onesignal";

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

      await identifyOneSignalUser(user.id, isAdmin ? "admin" : "student");
      if (cancelled) return;

      // Auto-ask for notifications as soon as the app opens (no bell click)
      await ensurePushSubscription();
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, session?.access_token, loading]);

  return null;
}
