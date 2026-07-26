import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Lightbulb, Archive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLiveReload } from "@/hooks/useLiveReload";

export const Route = createFileRoute("/admin/feedback")({
  component: AdminFeedback,
});

interface FeedbackRow {
  id: string;
  user_id: string;
  category: string;
  title: string;
  body: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

const STATUSES = ["new", "reviewed", "planned", "done", "archived"] as const;

function AdminFeedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [filter, setFilter] = useState<string>("new");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = supabase
      .from("app_feedback")
      .select("id, user_id, category, title, body, status, admin_note, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as FeedbackRow[];
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      setRows(
        list.map((r) => ({
          ...r,
          profiles: map.get(r.user_id)
            ? { full_name: map.get(r.user_id)!.full_name, avatar_url: map.get(r.user_id)!.avatar_url }
            : null,
        })),
      );
    } else {
      setRows(list);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload("admin-feedback-live", [{ table: "app_feedback", event: "*" }], load, { debounceMs: 500 });

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("app_feedback").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function saveNote(id: string, admin_note: string) {
    const { error } = await supabase.from("app_feedback").update({ admin_note }).eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-bold text-lg">Student feedback</h1>
          <p className="text-xs text-muted-foreground">Ideas and suggestions from the app Feedback tab</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {["new", "reviewed", "planned", "done", "archived", "all"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap ${
              filter === s ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <div className="text-xs text-muted-foreground py-8 text-center">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-10">No feedback in this filter.</div>
      )}

      <div className="space-y-3">
        {rows.map((f) => (
          <div key={f.id} className="rounded-2xl border border-border bg-card shadow-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              {f.profiles?.avatar_url ? (
                <img src={f.profiles.avatar_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
              ) : (
                <div className="h-9 w-9 rounded-xl gradient-primary grid place-items-center text-primary-foreground text-xs font-bold">
                  {(f.profiles?.full_name ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{f.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {f.profiles?.full_name ?? "Student"} · {f.category} ·{" "}
                  {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap">{f.body}</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void setStatus(f.id, s)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize ${
                    f.status === s ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {s === "archived" ? (
                    <span className="inline-flex items-center gap-1">
                      <Archive className="h-3 w-3" /> {s}
                    </span>
                  ) : (
                    s
                  )}
                </button>
              ))}
            </div>
            <textarea
              defaultValue={f.admin_note ?? ""}
              placeholder="Admin note (private)…"
              rows={2}
              onBlur={(e) => void saveNote(f.id, e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs outline-none focus:border-primary resize-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
