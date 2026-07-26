import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, BellOff, Bug, RefreshCw, RotateCcw, Send, Sliders } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  NOTIF_CATEGORIES,
  getNotifPrefs,
  setNotifPref,
  syncAllTags,
  type NotifCategory,
  type NotifPrefs,
} from "@/lib/notif-prefs";
import {
  emitPushStatusChanged,
  getLastSyncAt,
  getPushStatus,
  getWorkerInfo,
  onPushStatusChanged,
  resetPushRegistration,
  type PushStatus,
} from "@/lib/onesignal";
import { notifyUsers } from "@/lib/push";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notifications")({
  ssr: false,
  component: NotificationsPage,
});

const TESTS: { key: NotifCategory; title: string; body: string; url: string }[] = [
  { key: "dm", title: "Private message test", body: "This simulates a new private message.", url: "/" },
  { key: "classroom", title: "Classroom chat test", body: "This simulates a new classroom message.", url: "/chat" },
  { key: "announcement", title: "Announcement test", body: "This simulates a new announcement.", url: "/" },
  { key: "lesson", title: "New lesson test", body: "This simulates a new lesson upload.", url: "/lessons" },
  { key: "activity", title: "New activity test", body: "This simulates a new activity.", url: "/activities" },
  { key: "quiz", title: "New quiz test", body: "This simulates a new quiz.", url: "/quizzes" },
  { key: "submission", title: "Submission test", body: "This simulates a student submission.", url: "/admin" },
  { key: "new_user", title: "New student test", body: "This simulates a new student joining.", url: "/admin/students" },
];

function NotificationsPage() {
  const { user, isAdmin } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [worker, setWorker] = useState<Awaited<ReturnType<typeof getWorkerInfo>>>(null);
  const [lastSync, setLastSync] = useState<number | null>(getLastSyncAt());
  const [sending, setSending] = useState<NotifCategory | null>(null);
  const [resetting, setResetting] = useState(false);

  const refresh = useCallback(async () => {
    const [s, w] = await Promise.all([getPushStatus(), getWorkerInfo()]);
    setStatus(s);
    setWorker(w);
    setLastSync(getLastSyncAt());
  }, []);

  useEffect(() => {
    if (!user) return;
    setPrefs(getNotifPrefs(user.id));
    void refresh();
    const unsub = onPushStatusChanged(() => void refresh());
    return unsub;
  }, [user, refresh]);

  const visibleCategories = useMemo(() => {
    return NOTIF_CATEGORIES.filter((c) => {
      if (c.audience === "both") return true;
      return isAdmin ? c.audience === "admin" : c.audience === "student";
    });
  }, [isAdmin]);

  function togglePref(key: NotifCategory, value: boolean) {
    if (!user || !prefs) return;
    const next = setNotifPref(user.id, key, value);
    setPrefs(next);
  }

  function sendTest(cat: NotifCategory) {
    if (!user || sending) return;
    const t = TESTS.find((x) => x.key === cat)!;
    setSending(cat);
    notifyUsers([user.id], t.title, t.body, t.url);
    toast.success(`Test sent: ${t.title}`);
    setTimeout(() => setSending(null), 1500);
  }

  async function onReset() {
    if (resetting) return;
    setResetting(true);
    try {
      await resetPushRegistration();
      toast.success("Push registration reset — reload the page then re-enable.");
      emitPushStatusChanged();
      await refresh();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 pt-4 pb-8">
      <header className="flex items-center gap-3 mb-5">
        <Link to="/profile" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-xs text-muted-foreground">Preferences, testers & diagnostics</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-2 rounded-xl hover:bg-muted"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {/* Preferences */}
      <section className="rounded-2xl bg-card border border-border p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="h-4 w-4 text-primary" />
          <h2 className="font-bold text-sm">Categories</h2>
        </div>
        <div className="space-y-2">
          {prefs &&
            visibleCategories.map((cat) => {
              const on = prefs[cat.key];
              return (
                <label
                  key={cat.key}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{cat.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-snug">{cat.description}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => togglePref(cat.key, e.target.checked)}
                    className="h-5 w-9 appearance-none rounded-full bg-muted-foreground/30 checked:bg-primary relative transition-colors cursor-pointer after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-4"
                  />
                </label>
              );
            })}
        </div>
        <button
          type="button"
          onClick={() => user && (syncAllTags(user.id), toast.success("Preferences synced"))}
          className="mt-3 text-xs text-muted-foreground underline"
        >
          Re-sync preferences to my device
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Preferences persist per user on this device and mirror as tags on your OneSignal subscription.
        </p>
      </section>

      {/* Tester */}
      <section className="mt-6 rounded-2xl bg-card border border-border p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Send className="h-4 w-4 text-emerald-600" />
          <h2 className="font-bold text-sm">Trigger tester</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Sends a sample push for each trigger to your own subscription. Verify each on mobile & iOS.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TESTS.filter((t) => visibleCategories.some((c) => c.key === t.key)).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => sendTest(t.key)}
              disabled={sending === t.key || !status?.optedIn}
              className="px-3 py-2 rounded-xl bg-muted border border-border text-xs font-semibold hover:bg-muted/70 disabled:opacity-50"
            >
              {sending === t.key ? "Sending…" : t.title.replace(" test", "")}
            </button>
          ))}
        </div>
        {!status?.optedIn && (
          <p className="mt-2 text-[11px] text-amber-600">
            Enable push notifications first (Profile → Push notifications) to run tests.
          </p>
        )}
      </section>

      {/* Debug */}
      <section className="mt-6 rounded-2xl bg-card border border-border p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Bug className="h-4 w-4 text-rose-600" />
          <h2 className="font-bold text-sm">Debug panel</h2>
        </div>
        <dl className="text-xs space-y-1.5">
          <Row label="Subscribed">
            <StatusPill on={!!status?.optedIn} onLabel="yes" offLabel="no" />
          </Row>
          <Row label="Permission">{status?.permission ?? "…"}</Row>
          <Row label="iOS">{status?.isIOS ? "yes" : "no"}</Row>
          <Row label="Standalone (PWA)">{status?.isStandalone ? "yes" : "no"}</Row>
          <Row label="Supported">{status?.supported ? "yes" : "no"}</Row>
          <Row label="SW scope">{worker?.scope ?? "—"}</Row>
          <Row label="SW state">{worker?.state ?? "—"}</Row>
          <Row label="SW script">
            <span className="truncate max-w-[180px] inline-block align-middle">{worker?.scriptURL ?? "—"}</span>
          </Row>
          <Row label="Last sync">
            {lastSync ? new Date(lastSync).toLocaleTimeString() : "—"}
          </Row>
          <Row label="Trigger routing">
            <span className="text-muted-foreground">{isAdmin ? "admin" : "student"}</span>
          </Row>
        </dl>
        <details className="mt-3 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Trigger routing map</summary>
          <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
            <li>Private message → recipient user</li>
            <li>Classroom chat → all students (except sender)</li>
            <li>Announcement / Lesson / Activity / Quiz → all students</li>
            <li>Submission → all admins</li>
            <li>New student → all admins</li>
          </ul>
        </details>
        <button
          type="button"
          onClick={() => void onReset()}
          disabled={resetting}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20 text-xs font-semibold hover:bg-rose-500/15 disabled:opacity-50"
        >
          {resetting ? <BellOff className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {resetting ? "Resetting…" : "Reset push registration"}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Use if you see 404s or a stale subscription in the console — clears OneSignal storage and unregisters the worker.
        </p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function StatusPill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        on ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
      }`}
    >
      <Bell className="h-3 w-3" />
      {on ? onLabel : offLabel}
    </span>
  );
}
