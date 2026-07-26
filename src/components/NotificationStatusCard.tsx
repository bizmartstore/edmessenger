import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Send, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getPushStatus, requestPushPermission, subscribePushChange, type PushStatus } from "@/lib/onesignal";
import { notifyUsers } from "@/lib/push";
import { toast } from "sonner";

interface Props {
  userId: string;
}

export function NotificationStatusCard({ userId }: Props) {
  const { isAdmin } = useAuth();
  const role = isAdmin ? "admin" : "student";
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const s = await getPushStatus(userId, role);
      if (!cancelled) setStatus(s);
    }
    void refresh();
    const unsub = subscribePushChange(userId, role, () => void refresh());
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId, role]);

  async function enable() {
    if (enabling) return;
    setEnabling(true);
    try {
      const ok = await requestPushPermission(userId, role);
      if (ok) {
        toast.success("Notifications enabled");
        setStatus(await getPushStatus(userId, role));
      } else {
        toast.error("Permission not granted — check browser notification settings");
      }
    } finally {
      setEnabling(false);
    }
  }

  async function test() {
    if (testing) return;
    setTesting(true);
    try {
      notifyUsers([userId], "EdMessenger test", "If you see this, push is working!", "/");
      toast.success("Test sent — check your notification tray");
    } finally {
      setTimeout(() => setTesting(false), 2000);
    }
  }

  if (!status) return null;

  const optedIn = status.optedIn;
  const denied = status.permission === "denied";
  const iosNeedsInstall = status.iosNeedsInstall;

  return (
    <section className="mt-6 rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-sm">Push notifications</h2>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${
            optedIn
              ? "bg-emerald-500/10 text-emerald-600"
              : denied
                ? "bg-rose-500/10 text-rose-600"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {optedIn ? <CheckCircle2 className="h-5 w-5" /> : denied ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {optedIn
              ? "Subscribed"
              : denied
                ? "Blocked in browser settings"
                : iosNeedsInstall
                  ? "Install to Home Screen first"
                  : "Not subscribed"}
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            {optedIn
              ? "You'll receive alerts even when the app is closed."
              : denied
                ? "Re-enable notifications for this site in your browser/system settings, then reload."
                : iosNeedsInstall
                  ? "On iPhone, use Share → Add to Home Screen and open the app from the icon."
                  : "Turn on push to hear about new messages and announcements."}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!optedIn && !denied && !iosNeedsInstall && (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={enabling}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold shadow-glow disabled:opacity-50"
          >
            <Bell className="h-3.5 w-3.5" /> {enabling ? "Enabling…" : "Enable notifications"}
          </button>
        )}
        {optedIn && (
          <button
            type="button"
            onClick={() => void test()}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted border border-border text-xs font-semibold hover:bg-muted/70 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> {testing ? "Sending…" : "Send test notification"}
          </button>
        )}
        {iosNeedsInstall && (
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted border border-border text-xs text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" /> iOS PWA required
          </div>
        )}
      </div>
    </section>
  );
}
