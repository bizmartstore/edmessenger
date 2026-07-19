import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Download, Eye, FileText } from "lucide-react";
import { humanSize } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";

export const Route = createFileRoute("/_app/lessons")({
  component: LessonsPage,
});

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

function LessonsPage() {
  const { markRead } = useUnreadBadges();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void markRead("lessons");
  }, [markRead]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("lessons").select("*").order("created_at", { ascending: false });
      setLessons((data ?? []) as Lesson[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-md mx-auto px-5 pt-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center shadow-glow">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Lessons & Modules</h1>
          <p className="text-xs text-muted-foreground">Read online or download</p>
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!loading && lessons.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground rounded-2xl bg-card border border-dashed border-border">
            No lessons uploaded yet.
          </div>
        )}
        {lessons.map((l) => (
          <div key={l.id} className="rounded-2xl p-4 bg-card border border-border shadow-card">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{l.title}</div>
                {l.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{l.description}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  PDF · {humanSize(l.file_size)} · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <a
                href={l.file_url}
                target="_blank"
                rel="noopener"
                className="flex-1 py-2 rounded-xl bg-muted hover:bg-secondary flex items-center justify-center gap-1.5 text-xs font-semibold"
              >
                <Eye className="h-3.5 w-3.5" /> Read
              </a>
              <a
                href={l.file_url}
                download={l.file_name}
                className="flex-1 py-2 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center gap-1.5 text-xs font-semibold"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
