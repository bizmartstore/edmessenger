import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { ClipboardList, CheckCircle2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_app/quizzes")({
  component: QuizzesList,
});

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  question_count?: number;
  attempted?: boolean;
  score?: number | null;
}

function QuizzesList() {
  const { user } = useAuth();
  const { markRead } = useUnreadBadges();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  useEffect(() => {
    void markRead("quizzes");
  }, [markRead]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: qs } = await supabase.from("quizzes").select("*").eq("published", true).order("created_at", { ascending: false });
      const list = (qs ?? []) as Quiz[];
      const ids = list.map((q) => q.id);
      if (ids.length === 0) { setQuizzes([]); return; }
      const { data: counts } = await supabase.from("quiz_questions").select("quiz_id").in("quiz_id", ids);
      const { data: attempts } = await supabase.from("quiz_attempts").select("quiz_id, score").in("quiz_id", ids).eq("user_id", user.id);
      const countMap = new Map<string, number>();
      (counts ?? []).forEach((c: { quiz_id: string }) => countMap.set(c.quiz_id, (countMap.get(c.quiz_id) ?? 0) + 1));
      const attMap = new Map<string, number | null>();
      (attempts ?? []).forEach((a: { quiz_id: string; score: number | null }) => attMap.set(a.quiz_id, a.score));
      setQuizzes(list.map((q) => ({ ...q, question_count: countMap.get(q.id) ?? 0, attempted: attMap.has(q.id), score: attMap.get(q.id) ?? null })));
    })();
  }, [user]);

  return (
    <div className="max-w-md mx-auto px-5 pt-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center shadow-glow">
          <ClipboardList className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Quizzes</h1>
          <p className="text-xs text-muted-foreground">Test what you've learned</p>
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {quizzes.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground rounded-2xl bg-card border border-dashed border-border">
            No quizzes available yet.
          </div>
        )}
        {quizzes.map((q) => (
          <Link
            key={q.id}
            to="/quizzes/$id"
            params={{ id: q.id }}
            className="block rounded-2xl p-4 bg-card border border-border shadow-card hover:shadow-glow transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{q.title}</div>
                {q.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{q.description}</div>}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{q.question_count} questions</span>
                  {q.attempted && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Score {q.score}/{q.question_count}
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
