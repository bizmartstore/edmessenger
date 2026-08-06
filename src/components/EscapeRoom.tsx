import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Lightbulb, Lock, Timer, Trophy, Unlock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ESCAPE_MAX_SCORE,
  formatClock,
  isCorrect,
  sceneImage,
  scoreEscapeRun,
  type EscapeConfig,
} from "@/lib/escape-room";

interface EscapeAttempt {
  seconds: number;
  hints_used: number;
  wrong_answers: number;
  score: number;
}

export function EscapeRoom({
  activityId,
  userId,
  config,
  onFinished,
}: {
  activityId: string;
  userId: string;
  config: EscapeConfig;
  onFinished?: (score: number) => void;
}) {
  const puzzles = useMemo(() => config.puzzles ?? [], [config.puzzles]);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [shake, setShake] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState<EscapeAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("activity_escape_attempts")
        .select("seconds, hints_used, wrong_answers, score")
        .eq("activity_id", activityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (data) setAttempt(data as EscapeAttempt);
    })();
  }, [activityId, userId]);

  useEffect(() => {
    if (!started || attempt) return;
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [started, attempt]);

  const current = puzzles[index];
  const progress = puzzles.length ? Math.round((index / puzzles.length) * 100) : 0;

  async function finish(totalSeconds: number, hintsUsed: number, wrongAnswers: number) {
    const score = scoreEscapeRun({
      seconds: totalSeconds,
      parSeconds: config.par_seconds,
      hintsUsed,
      wrongAnswers,
    });
    setSaving(true);
    try {
      const { error } = await supabase.from("activity_escape_attempts").upsert(
        {
          activity_id: activityId,
          user_id: userId,
          seconds: totalSeconds,
          hints_used: hintsUsed,
          wrong_answers: wrongAnswers,
          score,
          max_score: ESCAPE_MAX_SCORE,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "activity_id,user_id" },
      );
      if (error) throw error;
      setAttempt({
        seconds: totalSeconds,
        hints_used: hintsUsed,
        wrong_answers: wrongAnswers,
        score,
      });
      onFinished?.(score);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save your escape score");
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (!current) return;
    if (isCorrect(answer, current.answer)) {
      setAnswer("");
      setShowHint(false);
      const next = index + 1;
      if (next >= puzzles.length) {
        const total = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(total);
        void finish(total, hints, wrong);
      } else {
        setIndex(next);
        toast.success("Lock opened!");
      }
    } else {
      setWrong((w) => w + 1);
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      toast.error("That doesn't unlock it. Try again.");
    }
  }

  if (puzzles.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        This escape room has no puzzles yet.
      </div>
    );
  }

  if (attempt) {
    return (
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="relative">
          <img
            src={sceneImage("vault")}
            alt="Escaped the room"
            loading="lazy"
            width={1024}
            height={640}
            className="h-40 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
        </div>
        <div className="p-5 text-center -mt-10 relative">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl gradient-primary shadow-glow">
            <Trophy className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="mt-3 text-lg font-bold">You escaped!</div>
          <div className="mt-1 text-4xl font-black tabular-nums">
            {attempt.score}
            <span className="text-base font-semibold text-muted-foreground">
              /{ESCAPE_MAX_SCORE}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-xl bg-muted p-2">
              <div className="font-bold tabular-nums">{formatClock(attempt.seconds)}</div>
              <div className="text-muted-foreground">Time</div>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <div className="font-bold tabular-nums">{attempt.hints_used}</div>
              <div className="text-muted-foreground">Hints</div>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <div className="font-bold tabular-nums">{attempt.wrong_answers}</div>
              <div className="text-muted-foreground">Misses</div>
            </div>
          </div>
          {saving && <div className="mt-2 text-[10px] text-muted-foreground">Saving…</div>}
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <img
          src={sceneImage(puzzles[0]?.scene)}
          alt="Escape room entrance"
          width={1024}
          height={640}
          className="h-44 w-full object-cover"
        />
        <div className="p-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            <Lock className="h-3 w-3" /> Escape room
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {config.intro || "Solve every puzzle to escape!"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-muted p-2.5">
              <div className="font-bold">{puzzles.length} locks</div>
              <div className="text-muted-foreground">to open</div>
            </div>
            <div className="rounded-xl bg-muted p-2.5">
              <div className="font-bold">{formatClock(config.par_seconds || 600)}</div>
              <div className="text-muted-foreground">for a perfect 30</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              startedAt.current = Date.now();
              setStarted(true);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            <KeyRound className="h-4 w-4" /> Enter the room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="relative">
        <img
          src={current?.image_url || sceneImage(current?.scene)}
          alt={current?.title ?? "Escape room"}
          loading="lazy"
          width={1024}
          height={640}
          className="h-44 w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/20 to-transparent" />
        <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-bold tabular-nums backdrop-blur">
          <Timer className="h-3.5 w-3.5" /> {formatClock(elapsed)}
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Lock {index + 1} of {puzzles.length}
          </div>
          <div className="text-lg font-black drop-shadow">{current?.title}</div>
        </div>
      </div>

      <div className="h-1.5 w-full bg-muted">
        <div
          className="h-full gradient-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-5">
        {current?.story && (
          <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">
            {current.story}
          </p>
        )}
        <p className="mt-3 text-sm font-semibold">{current?.question}</p>

        <div className={`mt-3 flex gap-2 ${shake ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Type the code / answer"
            className="flex-1 rounded-2xl border border-border bg-muted px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded-2xl gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            <Unlock className="h-4 w-4" />
          </button>
        </div>

        {current?.hint && (
          <div className="mt-3">
            {showHint ? (
              <div className="rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-700">
                💡 {current.hint}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowHint(true);
                  setHints((h) => h + 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-[11px] font-semibold"
              >
                <Lightbulb className="h-3.5 w-3.5" /> Reveal hint (−2 pts)
              </button>
            )}
          </div>
        )}

        <div className="mt-3 text-[10px] text-muted-foreground">
          Hints used {hints} · Wrong tries {wrong} · Faster escapes score higher (max{" "}
          {ESCAPE_MAX_SCORE} pts)
        </div>
      </div>
    </div>
  );
}
