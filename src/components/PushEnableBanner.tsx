import { useEffect, useState } from "react";
import { Bell, X, Share } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getPushStatus,
  requestPushPermission,
  subscribePushChange,
  type PushStatus,
} from "@/lib/onesignal";

const DISMISS_KEY = "edmessenger.pushDismissed";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Module-level guard: guarantees only one banner instance renders at once,
// even if the component is mounted twice (StrictMode / layout remounts).
let bannerMounted = false;

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) {
    if (raw === "1") {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      return true;
    }
    return false;
  }
  return Date.now() - ts < THREE_DAYS_MS;
}

export function clearPushDismiss(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DISMISS_KEY);
}

export function PushEnableBanner() {
  const { user } = useAuth();
  const [owner, setOwner] = useState(false);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Claim single-instance ownership.
  useEffect(() => {
    if (bannerMounted) return;
    bannerMounted = true;
    setOwner(true);
    return () => {
      bannerMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!owner || !user) return;
    let cancelled = false;

    async function refresh() {
      const s = await getPushStatus();
      if (!cancelled) setStatus(s);
    }

    void refresh();
    const unsub = subscribePushChange(() => {
      void refresh();
    });
    // Refresh when tab regains focus (permission may have changed in Settings).
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [owner, user]);

  useEffect(() => {
    setDismissed(isDismissedRecently());
  }, [user]);

  // Reset cooldown once the user is subscribed, so a future re-subscription
  // prompt (after they unsubscribe) shows again after 3 days.
  useEffect(() => {
    if (status?.optedIn) clearPushDismiss();
  }, [status?.optedIn]);

  if (!owner || !user || !status) return null;
  if (dismissed) return null;

  // Already subscribed or explicitly denied → never show the banner.
  if (status.optedIn) return null;
  if (status.permission === "denied") return null;

  // Not supported at all (desktop old browsers etc.) → hide.
  if (!status.supported && !status.iosNeedsInstall) return null;

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await requestPushPermission();
      if (ok) {
        clearPushDismiss();
        const s = await getPushStatus();
        setStatus(s);
      } else {
        // User denied — hide banner and remember it.
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setDismissed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  const iosInstall = status.iosNeedsInstall;

  return (
    <div className="fixed bottom-36 inset-x-0 z-50 px-3 pointer-events-none safe-bottom">
      <div className="pointer-events-auto max-w-md mx-auto glass-card rounded-2xl p-3 flex items-start gap-3 shadow-glow border border-border animate-fade-up">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">Enable notifications</div>
          {iosInstall ? (
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              On iPhone, tap <Share className="inline h-3 w-3 -mt-0.5" /> Share → <b>Add to Home Screen</b>, then open EdMessenger from the icon to turn on alerts.
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Get alerts for new messages and announcements.
            </div>
          )}
          {!iosInstall && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              <Bell className="h-3.5 w-3.5" /> {busy ? "Enabling…" : "Enable"}
            </button>
          )}
        </div>
        <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-muted shrink-0" aria-label="Dismiss">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
