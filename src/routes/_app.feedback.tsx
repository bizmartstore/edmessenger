import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Lightbulb,
  Send,
  Bug,
  Sparkles,
  Wrench,
  Eye,
  Map,
  CheckCircle2,
  Archive,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifyRole } from "@/lib/push";
import { useLiveReload } from "@/hooks/useLiveReload";
import { formatDistanceToNow } from "date-fns";
import { feedbackStatusMeta, type FeedbackStatus } from "@/lib/feedback-status";
import { cn } from "@/lib/utils";
import { awardGcoins } from "@/lib/gcoins";

export const Route = createFileRoute("/_app/feedback")({
  component: FeedbackPage,
});

type Category = "feature" | "bug" | "improvement" | "other";

interface FeedbackRow {
  id: string;
  category: Category;
  title: string;
  body: string;
  status: string;
  created_at: string;
}

const CATEGORIES: { key: Category; label: string; icon: typeof Lightbulb }[] = [
  { key: "feature", label: "New feature", icon: Sparkles },
  { key: "improvement", label: "Improvement", icon: Wrench },
  { key: "bug", label: "Bug / issue", icon: Bug },
  { key: "other", label: "Other", icon: Lightbulb },
];

const STATUS_ICONS = {
  spark: CircleDot,
  eye: Eye,
  map: Map,
  check: CheckCircle2,
  archive: Archive,
} as const;

function FeedbackStatusBadge({ status }: { status: string }) {
  const meta = feedbackStatusMeta(status);
  const Icon = STATUS_ICONS[meta.icon];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide",
        meta.pill,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function FeedbackPage() {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState<Category>("feature");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<FeedbackRow[]>([]);

  const loadMine = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("app_feedback")
      .select("id, category, title, body, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setMine((data ?? []) as FeedbackRow[]);
  }, [user]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  useLiveReload("feedback-mine", [{ table: "app_feedback", event: "*" }], loadMine, {
    enabled: Boolean(user),
    debounceMs: 600,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || sending) return;
    if (title.trim().length < 2 || body.trim().length < 5) {
      toast.error("Please add a short title and a bit more detail");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("app_feedback").insert({
        user_id: user.id,
        category,
        title: title.trim(),
        body: body.trim(),
      });
      if (error) throw error;
      const name = profile?.full_name ?? "A student";
      notifyRole(
        "admin",
        "New app feedback",
        `${name}: ${title.trim()}`,
        "/admin/feedback",
      );
      awardGcoins("feedback");
      setTitle("");
      setBody("");
      setCategory("feature");
      toast.success("Thanks! Your feedback was sent to the admin.");
      void loadMine();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not send feedback");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-4 space-y-5 md:max-w-3xl md:w-full md:px-0">
      <header>
        <div className="inline-flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-widest">
          <Lightbulb className="h-3.5 w-3.5" /> Feedback
        </div>
        <h1 className="text-xl font-bold mt-1">Help make EdMessenger awesome</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suggest features, report issues, or share ideas students would love. Admins get a push when you submit.
        </p>
      </header>

      <form onSubmit={(e) => void submit(e)} className="rounded-3xl border border-border bg-card shadow-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`py-2.5 px-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 border transition-all ${
                category === c.key
                  ? "gradient-primary text-primary-foreground border-transparent shadow-glow"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title"
          maxLength={120}
          className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe your idea or issue…"
          maxLength={2000}
          rows={5}
          className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary resize-none"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full py-3 rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-40 inline-flex items-center justify-center gap-2"
        >
          <Send className="h-4 w-4" /> {sending ? "Sending…" : "Submit feedback"}
        </button>
      </form>

      <section className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">Your recent feedback</div>
        <div className="rounded-2xl border border-border/70 bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
          Status updates from admins appear here in color:{" "}
          <span className="font-semibold text-sky-700">Submitted</span>,{" "}
          <span className="font-semibold text-violet-700">Reviewed</span>,{" "}
          <span className="font-semibold text-amber-800">Planned</span>,{" "}
          <span className="font-semibold text-emerald-700">Done</span>.
        </div>
        {mine.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6">No feedback yet — be the first to suggest something!</div>
        )}
        {mine.map((f) => {
          const meta = feedbackStatusMeta(f.status);
          return (
            <div
              key={f.id}
              className={cn(
                "rounded-2xl border border-border bg-card p-3.5 shadow-card border-l-4 transition-colors",
                meta.accent,
              )}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{f.category}</span>
                <FeedbackStatusBadge status={f.status} />
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="font-semibold text-sm mt-1.5">{f.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{f.body}</div>
              <div
                className={cn(
                  "mt-2.5 rounded-xl border px-2.5 py-2 text-[11px] leading-snug",
                  meta.pill,
                )}
              >
                <span className="font-bold">{meta.label}: </span>
                {meta.description}
                {f.status === ("planned" satisfies FeedbackStatus) && (
                  <span className="block mt-1 opacity-90">Keep an eye on announcements for when it ships.</span>
                )}
                {f.status === "done" && (
                  <span className="block mt-1 opacity-90">Try the latest app update — your idea may already be live.</span>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
