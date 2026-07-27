import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/lessons_/reviewers/$id")({
  component: TakeReviewer,
});

interface Reviewer {
  id: string;
  title: string;
  description: string | null;
}

interface Q {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  order_index: number;
}

function TakeReviewer() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: r } = await supabase.from("reviewers").select("*").eq("id", id).maybeSingle();
      setReviewer(r as Reviewer | null);
      const { data: qs } = await supabase
        .from("reviewer_questions")
        .select("*")
        .eq("reviewer_id", id)
        .order("order_index");
      setQuestions(
        ((qs ?? []) as Q[]).map((q) => {
          let options: string[] = [];
          if (Array.isArray(q.options)) {
            options = q.options.map(String);
          } else if (typeof q.options === "string") {
            try {
              const parsed = JSON.parse(q.options) as unknown;
              if (Array.isArray(parsed)) options = parsed.map(String);
            } catch {
              options = [];
            }
          }
          return { ...q, options };
        }),
      );
    })();
  }, [id]);

  function pickAnswer(q: Q, optionIndex: number) {
    if (finished || revealed[q.id]) return;
    setAnswers((a) => ({ ...a, [q.id]: optionIndex }));
    setRevealed((r) => ({ ...r, [q.id]: true }));
  }

  async function finish() {
    if (!user || questions.length === 0) return;
    const score = questions.reduce((n, q) => n + (answers[q.id] === q.correct_index ? 1 : 0), 0);
    const { error } = await supabase.from("reviewer_attempts").upsert(
      {
        reviewer_id: id,
        user_id: user.id,
        answers,
        score,
      },
      { onConflict: "reviewer_id,user_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setFinished(true);
    toast.success(`You scored ${score}/${questions.length}`);
  }

  function tryAgain() {
    setAnswers({});
    setRevealed({});
    setFinished(false);
  }

  if (!reviewer) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const allAnswered = questions.length > 0 && questions.every((q) => revealed[q.id]);
  const score = questions.reduce((n, q) => n + (answers[q.id] === q.correct_index ? 1 : 0), 0);

  return (
    <div className="max-w-md mx-auto px-5 pt-6 pb-8 md:max-w-3xl md:w-full md:px-0">
      <Link
        to="/lessons"
        search={{ tab: "reviewers" }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Lessons · Reviewers
      </Link>
      <h1 className="text-xl font-bold">{reviewer.title}</h1>
      {reviewer.description && <p className="text-sm text-muted-foreground mt-1">{reviewer.description}</p>}
      <p className="text-[11px] text-muted-foreground mt-2">
        Answer each question to see the explanation. You can retry anytime.
      </p>

      {finished && (
        <div className="mt-4 rounded-2xl p-4 gradient-hero text-white shadow-glow animate-pop">
          <div className="text-xs opacity-90">Review score</div>
          <div className="text-2xl font-extrabold">
            {score} / {questions.length}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {questions.map((q, i) => {
          const shown = revealed[q.id];
          const chosen = answers[q.id];
          const isCorrect = chosen === q.correct_index;
          return (
            <div key={q.id} className="rounded-2xl p-4 bg-card border border-border shadow-card">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Question {i + 1}</div>
              <div className="mt-1 font-semibold text-sm">{q.question}</div>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, j) => {
                  const picked = chosen === j;
                  const correct = shown && q.correct_index === j;
                  const wrongPick = shown && picked && q.correct_index !== j;
                  return (
                    <button
                      key={j}
                      type="button"
                      disabled={shown || finished}
                      onClick={() => pickAnswer(q, j)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                        correct
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                          : wrongPick
                            ? "border-destructive bg-destructive/10 text-destructive"
                            : picked
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {correct && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                        {wrongPick && <XCircle className="h-4 w-4 shrink-0" />}
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
              {shown && (
                <div
                  className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                    isCorrect
                      ? "bg-emerald-500/10 text-emerald-800 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-900 border border-amber-500/20"
                  }`}
                >
                  <div className="font-semibold inline-flex items-center gap-1.5 mb-1">
                    <Lightbulb className="h-3.5 w-3.5" />
                    {isCorrect ? "Correct" : "Explanation"}
                  </div>
                  <div>
                    {q.explanation?.trim() ||
                      (isCorrect
                        ? "Nice work — that is the right answer."
                        : `The correct answer is: ${q.options[q.correct_index]}`)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {questions.length === 0 && (
        <div className="text-sm text-muted-foreground mt-4">This reviewer has no questions yet.</div>
      )}

      {!finished && allAnswered && (
        <button
          type="button"
          onClick={() => void finish()}
          className="mt-5 w-full py-3.5 rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow"
        >
          Finish review
        </button>
      )}

      {finished && (
        <button
          type="button"
          onClick={tryAgain}
          className="mt-5 w-full py-3.5 rounded-2xl bg-muted font-semibold inline-flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  );
}
