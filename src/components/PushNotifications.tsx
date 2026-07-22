import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { logoutOneSignal, setupOneSignalForUser } from "@/lib/onesignal";

export function PushNotifications() {
  const { user, isAdmin, loading } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (wasSignedIn.current) {
        wasSignedIn.current = false;
        void logoutOneSignal();
      }
      return;
    }

    wasSignedIn.current = true;
    void setupOneSignalForUser(user.id, isAdmin ? "admin" : "student").catch(() => {});
  }, [user, isAdmin, loading]);

  // OneSignal owns the only subscription prompt. This component only keeps
  // the signed-in app user linked to their push subscription.
  return null;
}