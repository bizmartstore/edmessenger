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

/**
 * Boots OneSignal for every signed-in user (student OR admin).
 * Must run on admin pages too so admins receive DMs / submission pushes when the app is closed.
 */
export function PushBootstrap() {
  const { user, isAdmin, session } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initOneSignal();
      if (cancelled) return;
      if (user) {
        await identifyOneSignalUser(user.id, isAdmin ? "admin" : "student");
        // Re-opt-in if permission already granted (keeps subscription alive after SW updates)
        if (await isPushEnabled()) {
          /* identifyOneSignalUser already optIns */
        }
      } else {
        await logoutOneSignal();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, session?.access_token]);

  return null;
}

/** Bell button — enable browser push (required once for closed-app delivery). */
export function PushOptIn({ className }: { className?: string }) {
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
      toast.message("Notifications are on. To turn off, use your browser site settings.");
      return;
    }
    const ok = await requestPushPermission();
    if (user) {
      await identifyOneSignalUser(user.id, isAdmin ? "admin" : "student");
    }
    setEnabled(ok);
    if (ok) toast.success("Push on — you'll get alerts even when the app is closed");
    else toast.error("Permission denied — enable notifications in your browser settings");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={className ?? "p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors"}
      title={enabled ? "Notifications on" : "Enable push notifications"}
    >
      {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
