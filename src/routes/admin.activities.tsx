import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FolderKanban, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import { sendPush } from "@/lib/onesignal";

export const Route = createFileRoute("/admin/activities")({
  component: AdminActivities,
});

interface Activity {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
  created_at: string;
}

interface SubRow {
  id: string;
  note: string;
  attachments: UploadedFile[] | null;
  created_at: string;
  user_id: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

function AdminActivities() {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);

  async function load() {
    const { data } = await supabase
      .from("activities")
      .select("id, title, description, due_at, created_at")
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
    setBusy(true);
    try {
      const { error } = await supabase.from("activities").insert({
        title: title.trim(),
        description: description.trim(),
        due_at: due ? new Date(due).toISOString() : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      setTitle("");
      setDescription("");
      setDue("");
      toast.success("Activity created");
      await load();
      void sendPush({
        title: "New activity",
        message: title.trim().slice(0, 80),
        url: "/activities",
        audience: "students",
      });
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

  async function viewSubs(activityId: string) {
    setOpenId(activityId);
    const { data } = await supabase
      .from("activity_submissions")
      .select("id, note, attachments, created_at, user_id")
      .eq("activity_id", activityId)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as SubRow[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      setSubs(
        rows.map((r) => ({
          ...r,
          profiles: map.get(r.user_id)
            ? { full_name: map.get(r.user_id)!.full_name, avatar_url: map.get(r.user_id)!.avatar_url }
            : null,
        }))
      );
    } else setSubs([]);
  }

  return (
    <div>
      <form onSubmit={create} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <FolderKanban className="h-4 w-4 text-primary" /> New activity
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
                <div className="font-semibold text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</div>
                {a.due_at && (
                  <div className="text-[10px] text-muted-foreground mt-1">Due {format(new Date(a.due_at), "PPp")}</div>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => viewSubs(a.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-[11px] font-semibold"
                  >
                    <Users className="h-3 w-3" /> Submissions
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => remove(a.id)} className="p-2 rounded-lg hover:bg-muted">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {openId === a.id && (
              <div className="mt-3 border-t border-border pt-3 space-y-3">
                {subs.length === 0 && <div className="text-xs text-muted-foreground">No submissions yet.</div>}
                {subs.map((s) => (
                  <div key={s.id} className="rounded-xl bg-muted/50 p-3">
                    <div className="text-sm font-medium">{s.profiles?.full_name ?? "Student"}</div>
                    <div className="text-[10px] text-muted-foreground">{format(new Date(s.created_at), "PPp")}</div>
                    {s.note && <div className="text-xs mt-1 whitespace-pre-wrap">{s.note}</div>}
                    <AttachmentList files={s.attachments} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
