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
 * Does NOT call optIn automatically — that requires an active SW + user gesture.
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

/** Bell button — tap once to allow notifications (needed for closed-app push). */
export function PushOptIn({ className }: { className?: string }) {
  const { user, isAdmin, session } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

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
    if (busy) return;
    if (enabled) {
      toast.message("Notifications are on. To turn off, use your browser site settings.");
      return;
    }
    setBusy(true);
    try {
      const ok = await requestPushPermission();
      if (user) {
        await identifyOneSignalUser(user.id, isAdmin ? "admin" : "student");
      }
      setEnabled(ok);
      if (ok) toast.success("Push on — alerts work even when the app is closed");
      else {
        toast.error(
          "Could not enable push. Allow notifications, then hard-refresh (Ctrl+Shift+R) and try the bell again."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={className ?? "p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors disabled:opacity-60"}
      title={enabled ? "Notifications on" : "Enable push notifications"}
    >
      {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
