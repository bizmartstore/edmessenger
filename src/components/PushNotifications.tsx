import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { emitPushStatusChanged, logoutOneSignal, setupOneSignalForUser } from "@/lib/onesignal";
import { syncAllTags } from "@/lib/notif-prefs";

export function PushNotifications() {
  const { user, isAdmin, loading } = useAuth();
  const wasSignedIn = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (wasSignedIn.current) {
        wasSignedIn.current = false;
        lastUserId.current = null;
        void logoutOneSignal();
      }
      return;
    }

    const changed = lastUserId.current !== user.id;
    wasSignedIn.current = true;
    lastUserId.current = user.id;
    void setupOneSignalForUser(user.id, isAdmin ? "admin" : "student")
      .then(() => {
        syncAllTags(user.id);
        if (changed) emitPushStatusChanged();
      })
      .catch(() => {});
  }, [user, isAdmin, loading]);

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
