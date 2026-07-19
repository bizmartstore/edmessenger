import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadToBucket, humanSize, type UploadedFile } from "@/lib/upload";
import { AttachmentList } from "@/components/AttachmentList";
import { toast } from "sonner";
import { format } from "date-fns";
import { sendPush } from "@/lib/onesignal";

export const Route = createFileRoute("/_app/activities/$id")({
  component: ActivityDetail,
});

interface Activity {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
}

interface Submission {
  id: string;
  note: string;
  attachments: UploadedFile[] | null;
  created_at: string;
}

function ActivityDetail() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [sub, setSub] = useState<Submission | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: a }, { data: s }] = await Promise.all([
        supabase.from("activities").select("id, title, description, due_at").eq("id", id).maybeSingle(),
        supabase.from("activity_submissions").select("id, note, attachments, created_at").eq("activity_id", id).eq("user_id", user.id).maybeSingle(),
      ]);
      setActivity(a as Activity | null);
      if (s) {
        setSub(s as Submission);
        setNote(s.note ?? "");
        setPending((s.attachments as UploadedFile[]) ?? []);
      }
    })();
  }, [id, user]);

  async function handleFiles(files: FileList | null) {
    if (!files || !user) return;
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of Array.from(files)) {
        uploaded.push(await uploadToBucket("activity-files", f, user.id, id));
      }
      setPending((p) => [...p, ...uploaded]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function submit() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("activity_submissions")
        .upsert(
          {
            activity_id: id,
            user_id: user.id,
            note: note.trim(),
            attachments: pending.length ? pending : null,
          },
          { onConflict: "activity_id,user_id" }
        )
        .select("id, note, attachments, created_at")
        .single();
      if (error) throw error;
      setSub(data as Submission);
      toast.success("Submitted");
      void sendPush({
        title: "Activity submission",
        message: `${profile?.full_name ?? "A student"} submitted: ${activity?.title ?? "activity"}`,
        url: "/admin/activities",
        audience: "admins",
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (!activity) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-xs text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 pt-4 pb-8">
      <header className="flex items-center gap-2 mb-4">
        <Link to="/activities" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-bold truncate">{activity.title}</h1>
          {activity.due_at && (
            <div className="text-[10px] text-muted-foreground">Due {format(new Date(activity.due_at), "PPP")}</div>
          )}
        </div>
      </header>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">{activity.description || "No description"}</p>

      {sub && (
        <div className="mb-3 text-xs text-emerald-600 font-semibold">
          Submitted {format(new Date(sub.created_at), "PPp")} — you can update below.
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        placeholder="Add a note…"
        className="w-full px-4 py-3 rounded-2xl bg-muted border border-border outline-none text-sm"
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-xs font-semibold"
        >
          <Paperclip className="h-3.5 w-3.5" /> Attach files
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="text-[10px] text-muted-foreground">Images & docs auto-compressed</span>
      </div>

      {pending.length > 0 && (
        <div className="mt-2">
          <AttachmentList files={pending} />
          <div className="text-[10px] text-muted-foreground mt-1">
            {pending.length} file(s) · {humanSize(pending.reduce((s, f) => s + f.size, 0))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="mt-4 w-full py-3 rounded-2xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send className="h-4 w-4" /> {busy ? "Submitting…" : sub ? "Update submission" : "Submit"}
      </button>
    </div>
  );
}
