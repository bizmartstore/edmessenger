import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AcademicPerformanceScore, AcademicQuizScore, AcademicTab, AcademicTermGrade } from "@/lib/academic";
import { TERM_OPTIONS } from "@/lib/academic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AcademicModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<AcademicTab>("quizzes");
  const [loading, setLoading] = useState(false);
  const [quizScores, setQuizScores] = useState<AcademicQuizScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<AcademicPerformanceScore[]>([]);
  const [summativeScores, setSummativeScores] = useState<AcademicQuizScore[]>([]);
  const [termGrades, setTermGrades] = useState<AcademicTermGrade[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    (async () => {
      const [quizRes, performanceRes, summativeRes, gradesRes] = await Promise.all([
        supabase
          .from("academic_quiz_scores")
          .select("id, title, score, max_score, created_at")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("academic_performance_scores")
          .select("id, title, score, max_score, created_at")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("academic_summative_scores")
          .select("id, title, score, max_score, created_at")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("academic_term_grades")
          .select("id, term_no, grade_value")
          .eq("student_id", user.id)
          .order("term_no", { ascending: true }),
      ]);

      setQuizScores((quizRes.data ?? []) as AcademicQuizScore[]);
      setPerformanceScores((performanceRes.data ?? []) as AcademicPerformanceScore[]);
      setSummativeScores((summativeRes.data ?? []) as AcademicQuizScore[]);
      setTermGrades((gradesRes.data ?? []) as AcademicTermGrade[]);
      setLoading(false);
    })();
  }, [open, user]);

  const gradeMap = useMemo(
    () => new Map<number, string>(termGrades.map((row) => [Number(row.term_no), row.grade_value])),
    [termGrades],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background md:bg-background/95 md:backdrop-blur-sm">
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-4 md:px-6">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-glow">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Academic</h2>
            <p className="text-xs text-muted-foreground">Only your own records are shown here.</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-2xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close academic"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <Tabs value={tab} onValueChange={(value) => setTab(value as AcademicTab)} className="w-full">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex h-auto min-w-max gap-1 rounded-2xl p-1">
                <TabsTrigger value="quizzes" className="rounded-xl px-3 py-2 text-xs">
                  Quizzes
                </TabsTrigger>
                <TabsTrigger value="performance" className="rounded-xl px-3 py-2 text-xs">
                  Performance
                </TabsTrigger>
                <TabsTrigger value="summative" className="rounded-xl px-3 py-2 text-xs">
                  Summative
                </TabsTrigger>
                {TERM_OPTIONS.map((term) => (
                  <TabsTrigger key={term.value} value={term.value} className="rounded-xl px-3 py-2 text-xs">
                    Final Grades {term.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {loading ? (
              <div className="grid min-h-[40vh] place-items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Loading academic records...
              </div>
            ) : (
              <>
                <TabsContent value="quizzes">
                  <ScoreList
                    title="Quiz Scores"
                    empty="No quiz scores yet."
                    rows={quizScores}
                  />
                </TabsContent>

                <TabsContent value="performance">
                  <ScoreList
                    title="Performance Scores"
                    empty="No performance scores yet."
                    rows={performanceScores}
                  />
                </TabsContent>

                <TabsContent value="summative">
                  <ScoreList title="Summative Tests" empty="No summative test scores yet." rows={summativeScores} />
                </TabsContent>

                {TERM_OPTIONS.map((term, index) => (
                  <TabsContent key={term.value} value={term.value}>
                    <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">Final Grade</div>
                      <div className="mt-2 text-3xl font-extrabold">
                        {gradeMap.get(index + 1) || "Not available yet"}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        This grade is entered by your teacher for {term.label}.
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function ScoreList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; title: string; score: number; max_score: number; created_at?: string }[];
}) {
  return (
    <section className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="font-semibold text-sm">{row.title}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Score: <span className="font-bold text-foreground">{row.score}</span> / {row.max_score}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
