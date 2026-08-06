import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FolderKanban, KeyRound, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import { notifyRole } from "@/lib/push";
import { AdminSubjectSelect } from "@/components/AdminSubjectSelect";
import { EscapeRoomBuilder } from "@/components/EscapeRoomBuilder";
import { DEFAULT_ESCAPE_CONFIG, formatClock, type EscapeConfig } from "@/lib/escape-room";

export const Route = createFileRoute("/admin/activities")({
  component: AdminActivities,
});

interface Activity {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
  created_at: string;
  format?: string | null;
}

interface SubRow {
  id: string;
  note: string;
  attachments: UploadedFile[] | null;
  created_at: string;
  user_id: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

interface EscapeRow {
  id: string;
  user_id: string;
  seconds: number;
  hints_used: number;
  wrong_answers: number;
  score: number;
  completed_at: string;
  name?: string | null;
}

function AdminActivities() {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [activityFormat, setActivityFormat] = useState<"standard" | "escape">("standard");
  const [escapeConfig, setEscapeConfig] = useState<EscapeConfig>(DEFAULT_ESCAPE_CONFIG);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [escapeRows, setEscapeRows] = useState<EscapeRow[]>([]);

  async function load() {
    const { data } = await supabase
      .from("activities")
      .select("id, title, description, due_at, created_at, format")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data ?? []) as Activity[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    if (!subjectId) {
      toast.error("Select a subject");
      return;
    }
    if (activityFormat === "escape" && escapeConfig.puzzles.length === 0) {
      toast.error("Add at least one escape room puzzle");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("activities").insert({
        title: title.trim(),
        description: description.trim(),
        due_at: due ? new Date(due).toISOString() : null,
        created_by: user?.id ?? null,
        subject_id: subjectId,
        format: activityFormat,
        escape_config: activityFormat === "escape" ? escapeConfig : null,
      });
      if (error) throw error;
      notifyRole(
        "student",
        activityFormat === "escape" ? "New escape room" : "New activity",
        title.trim(),
        "/activities",
      );
      setTitle("");
      setDescription("");
      setDue("");
      setEscapeConfig(DEFAULT_ESCAPE_CONFIG);
      toast.success("Activity created");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      await load();
    }
  }

  async function nameMap(ids: string[]) {
    if (!ids.length) return new Map<string, string | null>();
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    return new Map((data ?? []).map((p) => [p.id, p.full_name as string | null]));
  }

  async function viewSubs(activity: Activity) {
    setOpenId(activity.id);
    setSubs([]);
    setEscapeRows([]);
    if (activity.format === "escape") {
      const { data } = await supabase
        .from("activity_escape_attempts")
        .select("id, user_id, seconds, hints_used, wrong_answers, score, completed_at")
        .eq("activity_id", activity.id)
        .order("score", { ascending: false });
      const rows = (data ?? []) as EscapeRow[];
      const map = await nameMap([...new Set(rows.map((r) => r.user_id))]);
      setEscapeRows(rows.map((r) => ({ ...r, name: map.get(r.user_id) ?? null })));
      return;
    }
    const { data } = await supabase
      .from("activity_submissions")
      .select("id, note, attachments, created_at, user_id")
      .eq("activity_id", activity.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as SubRow[];
    const map = await nameMap([...new Set(rows.map((r) => r.user_id))]);
    setSubs(rows.map((r) => ({ ...r, profiles: { full_name: map.get(r.user_id) ?? null, avatar_url: null } })));
  }

  return (
    <div>
      <form onSubmit={create} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <FolderKanban className="h-4 w-4 text-primary" /> New activity
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "standard", label: "Standard submission" },
              { key: "escape", label: "Escape room" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActivityFormat(f.key)}
              className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                activityFormat === f.key
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
          maxLength={120}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Instructions"
          rows={3}
          maxLength={800}
          className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
        />
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
        />
        <AdminSubjectSelect value={subjectId} onChange={setSubjectId} required />

        {activityFormat === "escape" && (
          <EscapeRoomBuilder value={escapeConfig} onChange={setEscapeConfig} />
        )}

        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create activity"}
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-2xl p-4 bg-card border border-border">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  {a.title}
                  {a.format === "escape" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      <KeyRound className="h-3 w-3" /> Escape
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</div>
                {a.due_at && (
                  <div className="text-[10px] text-muted-foreground mt-1">Due {format(new Date(a.due_at), "PPp")}</div>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => viewSubs(a)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-[11px] font-semibold"
                  >
                    <Users className="h-3 w-3" /> {a.format === "escape" ? "Results" : "Submissions"}
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => remove(a.id)} className="p-2 rounded-lg hover:bg-muted">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {openId === a.id && (
              <div className="mt-3 border-t border-border pt-3 space-y-3">
                {a.format === "escape" ? (
                  escapeRows.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No escapes yet.</div>
                  ) : (
                    escapeRows.map((r) => (
                      <div key={r.id} className="rounded-xl bg-muted/50 p-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{r.name ?? "Student"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatClock(r.seconds)} · {r.hints_used} hint(s) · {r.wrong_answers} miss(es) ·{" "}
                            {format(new Date(r.completed_at), "PPp")}
                          </div>
                        </div>
                        <div className="text-lg font-black tabular-nums">{r.score}/30</div>
                      </div>
                    ))
                  )
                ) : (
                  <>
                    {subs.length === 0 && <div className="text-xs text-muted-foreground">No submissions yet.</div>}
                    {subs.map((s) => (
                      <div key={s.id} className="rounded-xl bg-muted/50 p-3">
                        <div className="text-sm font-medium">{s.profiles?.full_name ?? "Student"}</div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(s.created_at), "PPp")}</div>
                        {s.note && <div className="text-xs mt-1 whitespace-pre-wrap">{s.note}</div>}
                        <AttachmentList files={s.attachments} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
