import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  bindPushIdentity,
  ensurePushSubscription,
  isPushEnabled,
} from "@/lib/onesignal";

const DISMISS_KEY = "edmessenger.pushBanner.dismissed";

/**
 * The ONLY in-app "Enable notifications" UI.
 * Tap → browser Allow dialog (no OneSignal Slidedown duplicate).
 */
export function PushEnableBanner() {
  const { user, isAdmin, loading } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      setShow(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          if (!cancelled) setShow(true);
          return;
        }
        const enabled = await isPushEnabled();
        if (!cancelled) setShow(!enabled);
      } catch {
        if (!cancelled) setShow(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!show || !user) return null;

  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 max-w-md mx-auto animate-fade-up">
      <div className="rounded-2xl bg-card border border-border shadow-glow p-3 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl gradient-primary grid place-items-center shrink-0">
          <Bell className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Enable notifications</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {denied
              ? "Notifications are blocked. Open browser site settings → allow notifications, then reopen the app."
              : "Tap Allow so you get DMs, chat, and class updates when the app is closed."}
          </div>
          {!denied && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const ok = await ensurePushSubscription({ forcePrompt: true });
                  if (ok) {
                    await bindPushIdentity(user.id, isAdmin ? "admin" : "student");
                    try {
                      localStorage.removeItem(DISMISS_KEY);
                    } catch {
                      /* ignore */
                    }
                    setShow(false);
                  }
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-2 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
            >
              {busy ? "Enabling…" : "Allow notifications"}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setShow(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
