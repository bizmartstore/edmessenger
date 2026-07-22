import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { toast } from "sonner";
import { Upload, Trash2, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { notifyRole } from "@/lib/push";

export const Route = createFileRoute("/admin/lessons")({
  component: AdminLessons,
});

interface Lesson { id: string; title: string; description: string | null; file_url: string; file_name: string; file_size: number; created_at: string }

function AdminLessons() {
  const { user } = useAuth();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    const { data } = await supabase.from("lessons").select("*").order("created_at", { ascending: false });
    setLessons((data ?? []) as Lesson[]);
  }
  useEffect(() => { load(); }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !file || !title.trim()) return;
    setBusy(true);
    try {
      const up = await uploadToBucket("lessons", file, user.id);
      const { error } = await supabase.from("lessons").insert({
        title, description: desc || null, file_url: up.url, file_name: up.name, file_size: up.size, uploaded_by: user.id,
      });
      if (error) throw error;
      notifyRole("student", "New lesson", title.trim(), "/lessons");
      setTitle(""); setDesc(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      toast.success("Lesson uploaded");
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!confirm("Delete this lesson?")) return;
    await supabase.from("lessons").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <form onSubmit={upload} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-2">
        <div className="font-semibold text-sm">Upload lesson / module</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm" required />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm" />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-semibold"
          required
        />
        {file && <div className="text-[10px] text-muted-foreground">{file.name} · {humanSize(file.size)}</div>}
        <button disabled={busy} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
          <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload PDF"}
        </button>
      </form>

      <div className="mt-5 space-y-3">
        {lessons.map((l) => (
          <div key={l.id} className="rounded-2xl p-3 bg-card border border-border shadow-card flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{l.title}</div>
              <div className="text-[10px] text-muted-foreground">{humanSize(l.file_size)} · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</div>
            </div>
            <a href={l.file_url} target="_blank" rel="noopener" className="text-[10px] px-2 py-1 rounded-lg bg-muted font-semibold">View</a>
            <button onClick={() => del(l.id)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
