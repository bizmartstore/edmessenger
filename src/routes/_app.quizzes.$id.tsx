import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/quizzes/$id")({
  component: TakeQuiz,
});

interface Quiz { id: string; title: string; description: string | null }
interface Q { id: string; question: string; options: string[]; correct_index: number; order_index: number }

function TakeQuiz() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ score: number; total: number } | null>(null);
  const [existing, setExisting] = useState<{ score: number; answers: Record<string, number> } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: q } = await supabase.from("quizzes").select("*").eq("id", id).maybeSingle();
      setQuiz(q as Quiz);
      const { data: qs } = await supabase.from("quiz_questions").select("*").eq("quiz_id", id).order("order_index");
      setQuestions((qs ?? []) as Q[]);
      if (user) {
        const { data: att } = await supabase.from("quiz_attempts").select("score, answers").eq("quiz_id", id).eq("user_id", user.id).maybeSingle();
        if (att) { setExisting(att as { score: number; answers: Record<string, number> }); setAnswers((att.answers as Record<string, number>) ?? {}); setSubmitted({ score: att.score, total: (qs ?? []).length }); }
      }
    })();
  }, [id, user]);

  async function submit() {
    if (!user) return;
    const score = questions.reduce((n, q) => n + (answers[q.id] === q.correct_index ? 1 : 0), 0);
    const { error } = await supabase.from("quiz_attempts").upsert({
      quiz_id: id,
      user_id: user.id,
      answers,
      score,
    }, { onConflict: "quiz_id,user_id" });
    if (error) { toast.error(error.message); return; }
    setSubmitted({ score, total: questions.length });
    toast.success(`You scored ${score}/${questions.length}!`);
  }

  if (!quiz) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-md mx-auto px-5 pt-6">
      <Link to="/quizzes" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> All quizzes
      </Link>
      <h1 className="text-xl font-bold">{quiz.title}</h1>
      {quiz.description && <p className="text-sm text-muted-foreground mt-1">{quiz.description}</p>}

      {submitted && (
        <div className="mt-4 rounded-2xl p-4 gradient-hero text-white shadow-glow flex items-center gap-3 animate-pop">
          <Sparkles className="h-6 w-6" />
          <div>
            <div className="text-xs opacity-90">Your score</div>
            <div className="text-2xl font-extrabold">{submitted.score} / {submitted.total}</div>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl p-4 bg-card border border-border shadow-card">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Question {i + 1}</div>
            <div className="mt-1 font-semibold text-sm">{q.question}</div>
            <div className="mt-3 space-y-2">
              {q.options.map((opt, j) => {
                const chosen = answers[q.id] === j;
                const correct = submitted && q.correct_index === j;
                const wrongPick = submitted && chosen && q.correct_index !== j;
                return (
                  <button
                    key={j}
                    disabled={!!submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: j }))}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                      correct ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" :
                      wrongPick ? "border-destructive bg-destructive/10 text-destructive" :
                      chosen ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {correct && <CheckCircle2 className="h-4 w-4" />}
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!submitted && questions.length > 0 && (
        <button
          onClick={submit}
          disabled={Object.keys(answers).length !== questions.length}
          className="mt-5 w-full py-3.5 rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-40 disabled:shadow-none"
        >
          Submit answers
        </button>
      )}
      {submitted && (
        <button onClick={() => navigate({ to: "/quizzes" })} className="mt-5 w-full py-3.5 rounded-2xl bg-muted font-semibold">
          Back to quizzes
        </button>
      )}
      {existing && !submitted && questions.length === 0 && <div className="text-xs text-muted-foreground mt-3">No questions.</div>}
    </div>
  );
}
