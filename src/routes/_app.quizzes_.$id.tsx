import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle2, Sparkles, ShieldAlert, Timer } from "lucide-react";
import { toast } from "sonner";
import { notifyRole, notifyUsers } from "@/lib/push";

export const Route = createFileRoute("/_app/quizzes_/$id")({
  component: TakeQuiz,
});

interface Quiz { id: string; title: string; description: string | null; time_limit_seconds?: number | null }
interface Q { id: string; question: string; options: string[]; correct_index: number; order_index: number }

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function TakeQuiz() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ score: number; total: number; auto?: boolean } | null>(null);
  const [switches, setSwitches] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);

  const answersRef = useRef<Record<string, number>>({});
  const questionsRef = useRef<Q[]>([]);
  const submittedRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);
  const switchesRef = useRef(0);
  const startedRef = useRef(false);

  answersRef.current = answers;
  questionsRef.current = questions;

  const scoreOf = useCallback((ans: Record<string, number>) =>
    questionsRef.current.reduce((n, q) => n + (ans[q.id] === q.correct_index ? 1 : 0), 0), []);

  /** Persist current answers as an unsubmitted draft — the last saved state is what gets graded. */
  const saveDraft = useCallback(async (ans: Record<string, number>) => {
    if (!user || submittedRef.current) return;
    startedRef.current = true;
    await supabase.from("quiz_attempts").upsert({
      quiz_id: id,
      user_id: user.id,
      answers: ans,
      score: scoreOf(ans),
      submitted: false,
      tab_switches: switchesRef.current,
    }, { onConflict: "quiz_id,user_id" });
  }, [id, user, scoreOf]);

  const finalize = useCallback(async (reason: "manual" | "auto") => {
    if (!user || submittedRef.current) return;
    submittedRef.current = true;
    const ans = answersRef.current;
    const score = scoreOf(ans);
    const { error } = await supabase.from("quiz_attempts").upsert({
      quiz_id: id,
      user_id: user.id,
      answers: ans,
      score,
      submitted: true,
      auto_submitted: reason === "auto",
      tab_switches: switchesRef.current,
    }, { onConflict: "quiz_id,user_id" });
    if (error) { submittedRef.current = false; toast.error(error.message); return; }
    const name = profile?.full_name ?? "A student";
    notifyRole(
      "admin",
      reason === "auto" ? "Quiz auto-submitted" : "Quiz submitted",
      `${name} ${reason === "auto" ? "was auto-submitted for" : "submitted"} ${quiz?.title ?? "a quiz"}`,
      "/admin/quizzes",
    );
    setSubmitted({ score, total: questionsRef.current.length, auto: reason === "auto" });
    if (reason === "auto") {
      toast.error(`Quiz auto-submitted. Score: ${score}/${questionsRef.current.length}`);
    } else {
      toast.success(`You scored ${score}/${questionsRef.current.length}!`);
    }
  }, [id, user, profile?.full_name, quiz?.title, scoreOf]);

  useEffect(() => {
    (async () => {
      const { data: q } = await supabase.from("quizzes").select("*").eq("id", id).maybeSingle();
      setQuiz(q as Quiz);
      const { data: qs } = await supabase.from("quiz_questions").select("*").eq("quiz_id", id).order("order_index");
      const list = (qs ?? []) as Q[];
      setQuestions(list);
      questionsRef.current = list;

      if (user) {
        const { data: att } = await supabase
          .from("quiz_attempts")
          .select("score, answers, submitted, auto_submitted")
          .eq("quiz_id", id).eq("user_id", user.id).maybeSingle();
        if (att) {
          const saved = (att.answers as Record<string, number>) ?? {};
          setAnswers(saved);
          answersRef.current = saved;
          submittedRef.current = true;
          if (att.submitted === false) {
            // The student left the app mid-quiz — grade the last saved answers.
            await supabase.from("quiz_attempts")
              .update({ submitted: true, auto_submitted: true })
              .eq("quiz_id", id).eq("user_id", user.id);
            setSubmitted({ score: att.score, total: list.length, auto: true });
          } else {
            setSubmitted({ score: att.score, total: list.length, auto: !!att.auto_submitted });
          }
          return;
        }
      }

      const limit = Number((q as Quiz | null)?.time_limit_seconds ?? 0);
      if (limit > 0) {
        deadlineRef.current = Date.now() + limit * 1000;
        setRemaining(limit);
      }
    })();
  }, [id, user]);

  // Countdown
  useEffect(() => {
    if (submitted || deadlineRef.current == null) return;
    const t = setInterval(() => {
      const left = Math.ceil(((deadlineRef.current ?? 0) - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        void finalize("auto");
      }
    }, 500);
    return () => clearInterval(t);
  }, [submitted, finalize, quiz]);

  // Anti-cheat: tab switch / minimize
  useEffect(() => {
    if (submitted) return;
    const onHidden = () => {
      if (submittedRef.current || !startedRef.current) return;
      const next = switchesRef.current + 1;
      switchesRef.current = next;
      setSwitches(next);
      if (next === 1) {
        if (deadlineRef.current != null) {
          deadlineRef.current -= 30_000;
          setRemaining(Math.ceil((deadlineRef.current - Date.now()) / 1000));
        }
        if (user) {
          notifyUsers(
            [user.id],
            "Switching tabs is prohibited",
            "You lost 30 seconds. Leaving again will auto-submit your quiz.",
            `/quizzes/${id}`,
          );
        }
        toast.error("Switching tabs is strictly prohibited — 30 seconds deducted.");
      } else {
        void finalize("auto");
      }
    };
    const onVis = () => { if (document.visibilityState === "hidden") onHidden(); };
    const onBlurLeave = () => { void saveDraft(answersRef.current); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onBlurLeave);
    window.addEventListener("beforeunload", onBlurLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onBlurLeave);
      window.removeEventListener("beforeunload", onBlurLeave);
    };
  }, [submitted, finalize, saveDraft, user, id]);

  function choose(qid: string, j: number) {
    setAnswers((a) => {
      const next = { ...a, [qid]: j };
      answersRef.current = next;
      void saveDraft(next);
      return next;
    });
  }

  if (!quiz) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const lowTime = remaining != null && remaining <= 30;

  return (
    <div className="max-w-md mx-auto px-5 pt-6 md:max-w-3xl md:w-full md:px-0">
      <Link to="/quizzes" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> All quizzes
      </Link>
      <h1 className="text-xl font-bold">{quiz.title}</h1>
      {quiz.description && <p className="text-sm text-muted-foreground mt-1">{quiz.description}</p>}

      {!submitted && remaining != null && (
        <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold ${lowTime ? "bg-destructive/10 text-destructive animate-pulse" : "bg-primary/10 text-primary"}`}>
          <Timer className="h-4 w-4" /> {fmt(remaining)}
        </div>
      )}

      {!submitted && (
        <div className="mt-3 rounded-2xl p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs flex gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Stay on this screen. Switching tabs or minimizing costs 30 seconds; a second time auto-submits your quiz.
            Closing the app also submits your latest answers.
            {switches > 0 && <strong> Warnings used: {switches}/1</strong>}
          </span>
        </div>
      )}

      {submitted && (
        <div className="mt-4 rounded-2xl p-4 gradient-hero text-white shadow-glow flex items-center gap-3 animate-pop">
          <Sparkles className="h-6 w-6" />
          <div>
            <div className="text-xs opacity-90">{submitted.auto ? "Auto-submitted score" : "Your score"}</div>
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
                    onClick={() => choose(q.id, j)}
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
          onClick={() => finalize("manual")}
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
      {questions.length === 0 && <div className="text-xs text-muted-foreground mt-3">No questions.</div>}
    </div>
  );
}
