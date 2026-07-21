import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { identifyOneSignalUser, initOneSignal, logoutOneSignal } from "@/lib/onesignal";
import { PushEnableBanner } from "@/components/PushEnableBanner";

export function PushNotifications() {
  const { user, isAdmin, loading } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    void initOneSignal().catch(() => {});
  }, [user, loading]);

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
    void identifyOneSignalUser(user.id, isAdmin ? "admin" : "student").catch(() => {});
  }, [user, isAdmin, loading]);

  return <PushEnableBanner />;
}