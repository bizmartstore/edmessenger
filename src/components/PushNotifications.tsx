import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { identifyOneSignalUser, initOneSignal, logoutOneSignal } from "@/lib/onesignal";
import { PushEnableBanner } from "@/components/PushEnableBanner";

export function PushNotifications() {
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    void initOneSignal().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      void logoutOneSignal();
      return;
    }
    void identifyOneSignalUser(user.id, isAdmin ? "admin" : "student").catch(() => {});
  }, [user, isAdmin]);

  return <PushEnableBanner />;
}
