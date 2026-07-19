import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/announcements")({
  component: AdminAnnouncements,
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

function AdminAnnouncements() {
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Announcement[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("announcements").insert({
        title: title.trim(),
        body: body.trim(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      void supabase.rpc("prune_announcements");
      setTitle("");
      setBody("");
      toast.success("Announcement posted");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      await load();
    }
  }

  return (
    <div>
      <form onSubmit={post} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Megaphone className="h-4 w-4 text-primary" /> Post announcement
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
          maxLength={120}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message (keep it short)"
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
        />
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post to everyone"}
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-2xl p-4 bg-card border border-border">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</div>
                <div className="text-[10px] text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </div>
              </div>
              <button type="button" onClick={() => remove(a.id)} className="p-2 rounded-lg hover:bg-muted">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
