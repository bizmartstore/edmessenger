import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { emitPushStatusChanged, logoutOneSignal, setupOneSignalForUser } from "@/lib/onesignal";

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
    const role = isAdmin ? "admin" : "student";
    wasSignedIn.current = true;
    lastUserId.current = user.id;
    void setupOneSignalForUser(user.id, role)
      .then(() => {
        // Do not sync OneSignal tags on every session — login() identity
        // transfer routinely returns 409 and queued tag ops fail loudly.
        // Tags are written only when the user changes prefs (setNotifPref).
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
