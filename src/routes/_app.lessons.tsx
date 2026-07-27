import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Download, Eye, FileText, ClipboardCheck, ArrowRight, Lightbulb } from "lucide-react";
import { humanSize, downloadFile } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useLiveReload } from "@/hooks/useLiveReload";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";
import { useGcoins } from "@/hooks/useGcoins";
import { utcDayKey } from "@/lib/gcoins";

const lessonsSearchSchema = z.object({
  tab: z.enum(["materials", "reviewers"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/lessons")({
  validateSearch: lessonsSearchSchema,
  component: LessonsPage,
});

function downloadName(l: Lesson): string {
  const raw = (l.file_name || l.title || "lesson").trim();
  if (/\.[a-z0-9]{2,5}$/i.test(raw)) return raw;
  return `${raw}.pdf`;
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

interface Reviewer {
  id: string;
  lesson_id: string | null;
  title: string;
  description: string | null;
  created_at: string;
  question_count?: number;
  score?: number | null;
  attempted?: boolean;
}

function LessonsPage() {
  const { user } = useAuth();
  const { earn } = useGcoins();
  const { markRead } = useUnreadBadges();
  const navigate = Route.useNavigate();
  const { tab: tabFromSearch } = Route.useSearch();
  const tab = tabFromSearch === "reviewers" ? "reviewers" : "materials";
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    void markRead("lessons");
  }, [markRead]);

  const loadLessons = useCallback(async () => {
    const { data } = await supabase.from("lessons").select("*").order("created_at", { ascending: false });
    setLessons((data ?? []) as Lesson[]);
    setLoading(false);
  }, []);

  const loadReviewers = useCallback(async () => {
    const { data: rs } = await supabase
      .from("reviewers")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });
    const list = (rs ?? []) as Reviewer[];
    const ids = list.map((r) => r.id);
    if (ids.length === 0) {
      setReviewers([]);
      return;
    }
    const { data: counts } = await supabase.from("reviewer_questions").select("reviewer_id").in("reviewer_id", ids);
    const countMap = new Map<string, number>();
    (counts ?? []).forEach((c: { reviewer_id: string }) =>
      countMap.set(c.reviewer_id, (countMap.get(c.reviewer_id) ?? 0) + 1),
    );

    let attMap = new Map<string, number | null>();
    if (user) {
      const { data: attempts } = await supabase
        .from("reviewer_attempts")
        .select("reviewer_id, score")
        .in("reviewer_id", ids)
        .eq("user_id", user.id);
      attMap = new Map(
        (attempts ?? []).map((a: { reviewer_id: string; score: number | null }) => [a.reviewer_id, a.score]),
      );
    }

    setReviewers(
      list.map((r) => ({
        ...r,
        question_count: countMap.get(r.id) ?? 0,
        attempted: attMap.has(r.id),
        score: attMap.get(r.id) ?? null,
      })),
    );
  }, [user]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    void loadReviewers();
  }, [loadReviewers]);

  useLiveReload("lessons-live", [{ table: "lessons", event: "INSERT" }], loadLessons, {
    debounceMs: 800,
  });

  useLiveReload("reviewers-live", [{ table: "reviewers", event: "*" }], loadReviewers, {
    debounceMs: 800,
  });

  async function onDownload(l: Lesson) {
    if (!l.file_url) {
      toast.error("No file available for this lesson");
      return;
    }
    setDownloadingId(l.id);
    try {
      await downloadFile(l.file_url, downloadName(l));
      toast.success("Download started");
      // Award after a successful download; explain cap/claim results
      await earn("download_lesson", `download_lesson:${l.id}:${utcDayKey()}`, { explainZero: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  async function onViewLesson(l: Lesson) {
    if (viewingId) return;
    if (!l.file_url) {
      toast.error("No file available for this lesson");
      return;
    }
    setViewingId(l.id);
    // Open inside the click gesture first — awaiting earn() before window.open
    // lets browsers treat it as a popup and block it (looks like "nothing happens").
    const win = window.open(l.file_url, "_blank", "noopener,noreferrer");
    try {
      await earn("view_lesson", `view_lesson:${l.id}:${utcDayKey()}`, { explainZero: true });
      if (!win) {
        toast.message("Pop-up blocked", {
          description: "Allow pop-ups for this site to open lessons. GCoins still apply if eligible.",
          action: {
            label: "Open lesson",
            onClick: () => {
              window.open(l.file_url, "_blank", "noopener,noreferrer");
            },
          },
        });
      }
    } finally {
      setViewingId(null);
    }
  }

  const lessonTitle = (id: string | null) => lessons.find((l) => l.id === id)?.title;

  return (
    <div className="max-w-md mx-auto px-5 pt-6 md:max-w-none md:w-full md:px-0">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center shadow-glow">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Lessons & Modules</h1>
          <p className="text-xs text-muted-foreground">Read, download, or review</p>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          void navigate({
            search: { tab: v === "reviewers" ? "reviewers" : undefined },
            replace: true,
          })
        }
        className="mt-5"
      >
        <TabsList className="w-full grid grid-cols-2 h-10">
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="reviewers">Reviewers</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-4 space-y-3">
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
                  {l.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{l.description}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    PDF · {humanSize(l.file_size)} ·{" "}
                    {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  disabled={viewingId === l.id}
                  onClick={() => void onViewLesson(l)}
                  className="flex-1 py-2 rounded-xl bg-muted hover:bg-secondary flex items-center justify-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {viewingId === l.id ? "Opening…" : "Read"}
                </button>
                <button
                  type="button"
                  disabled={downloadingId === l.id}
                  onClick={() => void onDownload(l)}
                  className="flex-1 py-2 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingId === l.id ? "Saving…" : "Download"}
                </button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="reviewers" className="mt-4 space-y-3">
          {reviewers.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground rounded-2xl bg-card border border-dashed border-border">
              No reviewers available yet.
            </div>
          )}
          {reviewers.map((r) => (
            <Link
              key={r.id}
              to="/lessons/reviewers/$id"
              params={{ id: r.id }}
              className="block rounded-2xl p-4 bg-card border border-border shadow-card hover:shadow-glow transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="h-11 w-11 rounded-xl bg-sky-500/10 grid place-items-center shrink-0">
                    <ClipboardCheck className="h-5 w-5 text-sky-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">{r.title}</div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</div>
                    )}
                    {lessonTitle(r.lesson_id) && (
                      <div className="text-[10px] text-muted-foreground mt-1">For: {lessonTitle(r.lesson_id)}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                        {r.question_count} questions
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 font-semibold inline-flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" /> With explanations
                      </span>
                      {r.attempted && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                          Last {r.score}/{r.question_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              </div>
            </Link>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
