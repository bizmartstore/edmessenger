import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  identifyOneSignalUser,
  initOneSignal,
  isPushEnabled,
  logoutOneSignal,
  requestPushPermission,
} from "@/lib/onesignal";
import { toast } from "sonner";

export function PushOptIn() {
  const { user, isAdmin, session } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initOneSignal();
      if (cancelled) return;
      if (user) {
        await identifyOneSignalUser(user.id, isAdmin ? "admin" : "student");
      } else {
        await logoutOneSignal();
      }
      const on = await isPushEnabled();
      if (!cancelled) {
        setEnabled(on);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, session?.access_token]);

  if (!user || !ready) return null;

  async function toggle() {
    if (enabled) {
      toast.message("Disable notifications in your browser site settings if needed.");
      return;
    }
    const ok = await requestPushPermission();
    setEnabled(ok);
    if (ok) toast.success("Push notifications enabled");
    else toast.error("Permission denied — enable notifications in your browser");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors"
      title={enabled ? "Notifications on" : "Enable push notifications"}
    >
      {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
