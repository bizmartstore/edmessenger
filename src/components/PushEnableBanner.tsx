import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isPushOptedIn, requestPushPermission, subscribePushChange } from "@/lib/onesignal";

const DISMISS_KEY = "edmessenger.pushDismissed";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

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

export function PushEnableBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setVisible(false);
      return;
    }
    if (isDismissedRecently()) {
      setVisible(false);
      return;
    }

    // Show immediately so users see the prompt without waiting for SDK init.
    setVisible(true);

    let cancelled = false;

    async function refresh() {
      const optedIn = await isPushOptedIn();
      if (!cancelled) setVisible(!optedIn && !isDismissedRecently());
    }

    void refresh();
    const unsub = subscribePushChange(() => {
      void refresh();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  if (!user || !visible) return null;

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await requestPushPermission();
      if (ok) setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  return (
    <div className="fixed bottom-36 inset-x-0 z-50 px-3 pointer-events-none safe-bottom">
      <div className="pointer-events-auto max-w-md mx-auto glass-card rounded-2xl p-3 flex items-start gap-3 shadow-glow border border-border animate-fade-up">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">Enable notifications</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Get alerts for new messages and announcements.
          </div>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            <Bell className="h-3.5 w-3.5" /> {busy ? "Enabling…" : "Enable"}
          </button>
        </div>
        <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-muted shrink-0" aria-label="Dismiss">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
