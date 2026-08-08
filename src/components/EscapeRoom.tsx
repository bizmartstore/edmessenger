import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coins,
  KeyRound,
  Lightbulb,
  Lock,
  ShoppingBag,
  Timer,
  Trophy,
  Unlock,
  Snowflake,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGcoins } from "@/hooks/useGcoins";
import {
  ESCAPE_MAX_SCORE,
  formatClock,
  isCorrect,
  primaryAnswer,
  sceneImage,
  sceneLabel,
  scoreEscapeRun,
  type EscapeConfig,
} from "@/lib/escape-room";
import {
  buyPowerup,
  consumePowerup,
  emptyInventory,
  fetchPowerups,
  POWERUPS,
  type PowerupId,
  type PowerupInventory,
} from "@/lib/powerups";

interface EscapeAttempt {
  seconds: number;
  hints_used: number;
  wrong_answers: number;
  score: number;
}

const FREEZE_SECONDS = 45;
const SHIELD_CHARGES = 3;
const LUCKY_BONUS = 3;

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
  const { wallet, setBalance, refresh } = useGcoins();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [keys, setKeys] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [shield, setShield] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [attempt, setAttempt] = useState<EscapeAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<PowerupInventory>(emptyInventory);
  const [shopOpen, setShopOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [usedLog, setUsedLog] = useState<Record<string, number>>({});
  const startedAt = useRef<number>(0);
  const frozenMs = useRef<number>(0);

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
    void (async () => {
      const { inventory: inv } = await fetchPowerups();
      setInventory(inv);
    })();
  }, []);

  useEffect(() => {
    if (!started || attempt) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      if (now < frozenUntil) return;
      setElapsed(Math.floor((now - startedAt.current - frozenMs.current) / 1000));
    }, 500);
    return () => window.clearInterval(t);
  }, [started, attempt, frozenUntil]);

  const frozen = frozenUntil > Date.now();
  const current = puzzles[index];
  const progress = puzzles.length ? Math.round((index / puzzles.length) * 100) : 0;
  const runSeconds = useCallback(
    () => Math.max(0, Math.floor((Date.now() - startedAt.current - frozenMs.current) / 1000)),
    [],
  );

  async function finish(
    totalSeconds: number,
    hintsUsed: number,
    wrongAnswers: number,
    keysUsed: number,
    bonusPts: number,
  ) {
    const score = scoreEscapeRun({
      seconds: totalSeconds,
      parSeconds: config.par_seconds,
      hintsUsed,
      wrongAnswers,
      keysUsed,
      bonus: bonusPts,
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

  function advance(nextHints = hints, nextWrong = wrong, nextKeys = keys) {
    setAnswer("");
    setShowHint(false);
    setPeek(null);
    const next = index + 1;
    if (next >= puzzles.length) {
      const total = runSeconds();
      setElapsed(total);
      void finish(total, nextHints, nextWrong, nextKeys, bonus);
    } else {
      setIndex(next);
      toast.success(`Floor ${next} cleared!`);
    }
  }

  function submit() {
    if (!current) return;
    if (isCorrect(answer, current.answer)) {
      advance();
    } else {
      if (shield > 0) {
        setShield((s) => s - 1);
        toast.message("🛡️ Shield absorbed the miss", { description: `${shield - 1} left` });
      } else {
        setWrong((w) => w + 1);
      }
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      toast.error("That doesn't unlock it. Try again.");
    }
  }

  async function buy(id: PowerupId, price: number) {
    if (buying) return;
    setBuying(id);
    try {
      const res = await buyPowerup(id, 1);
      if (!res.ok) {
        if (res.reason === "insufficient") toast.error("Not enough GCoins");
        else if (res.reason === "not_migrated")
          toast.error("Powerups not ready", {
            description: "Ask admin to run SUPABASE_MIGRATION_ESCAPE_POWERUPS.sql",
          });
        else toast.error(res.reason ?? "Purchase failed");
        return;
      }
      if (res.inventory) setInventory(res.inventory);
      if (typeof res.balance === "number") setBalance(res.balance);
      else void refresh();
      toast.success(`Bought for ${price} GCoins`);
    } finally {
      setBuying(null);
    }
  }

  async function use(id: PowerupId) {
    if ((inventory[id] ?? 0) <= 0) {
      setShopOpen(true);
      return;
    }
    const res = await consumePowerup(id);
    if (!res.ok) {
      toast.error(res.reason === "none_left" ? "You have none left" : "Could not use powerup");
      if (res.inventory) setInventory(res.inventory);
      return;
    }
    if (res.inventory) setInventory(res.inventory);
    setUsedLog((u) => ({ ...u, [id]: (u[id] ?? 0) + 1 }));

    switch (id) {
      case "pw_time_freeze": {
        const until = Date.now() + FREEZE_SECONDS * 1000;
        setFrozenUntil(until);
        frozenMs.current += FREEZE_SECONDS * 1000;
        window.setTimeout(() => setFrozenUntil(0), FREEZE_SECONDS * 1000);
        toast.success(`⏳ Clock frozen for ${FREEZE_SECONDS}s`);
        break;
      }
      case "pw_xray":
        setShowHint(true);
        toast.success("🔮 Hint revealed — no penalty");
        break;
      case "pw_reveal_letters": {
        const a = primaryAnswer(current?.answer ?? "");
        setPeek(a.slice(0, 2));
        toast.success("🔤 First letters revealed");
        break;
      }
      case "pw_shield":
        setShield((s) => s + SHIELD_CHARGES);
        toast.success(`🛡️ Shield up — ${SHIELD_CHARGES} misses absorbed`);
        break;
      case "pw_lucky_charm":
        setBonus((b) => b + LUCKY_BONUS);
        toast.success(`🍀 +${LUCKY_BONUS} bonus points on escape`);
        break;
      case "pw_skeleton_key": {
        const nextKeys = keys + 1;
        setKeys(nextKeys);
        toast.success("🗝️ Lock forced open (−3 pts)");
        advance(hints, wrong, nextKeys);
        break;
      }
    }
  }

  if (puzzles.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        This escape room has no puzzles yet.
      </div>
    );
  }

  const shop = (
    <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest">
          <ShoppingBag className="h-3.5 w-3.5" /> Powerup shop
        </div>
        <div className="inline-flex items-center gap-1 text-xs font-bold tabular-nums">
          <Coins className="h-3.5 w-3.5 text-amber-500" /> {wallet.gcoins}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {POWERUPS.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-lg">
              {p.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">
                {p.name}{" "}
                <span className="text-[10px] font-semibold text-muted-foreground">
                  ×{inventory[p.id] ?? 0}
                </span>
              </div>
              <div className="text-[10px] leading-tight text-muted-foreground">{p.description}</div>
            </div>
            <button
              type="button"
              disabled={buying === p.id || wallet.gcoins < p.price}
              onClick={() => void buy(p.id, p.price)}
              className="shrink-0 rounded-xl gradient-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
            >
              {p.price}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

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
        <div className="relative -mt-10 p-5 text-center">
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
          <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
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
            <div className="rounded-xl bg-muted p-2">
              <div className="font-bold tabular-nums">
                {Object.values(usedLog).reduce((a, b) => a + b, 0)}
              </div>
              <div className="text-muted-foreground">Powerups</div>
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
              <div className="font-bold">{puzzles.length} floors</div>
              <div className="text-muted-foreground">to clear</div>
            </div>
            <div className="rounded-xl bg-muted p-2.5">
              <div className="font-bold">{formatClock(config.par_seconds || 600)}</div>
              <div className="text-muted-foreground">for a perfect 30</div>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {puzzles.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[11px]"
              >
                <span className="grid h-5 w-5 place-items-center rounded-md bg-background text-[10px] font-black">
                  {i + 1}
                </span>
                <span className="truncate font-semibold">{p.title || `Floor ${i + 1}`}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {sceneLabel(p.scene)}
                </span>
              </div>
            ))}
          </div>

          {shopOpen ? (
            shop
          ) : (
            <button
              type="button"
              onClick={() => setShopOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted py-2.5 text-xs font-semibold"
            >
              <ShoppingBag className="h-4 w-4" /> Powerup shop · {wallet.gcoins} GCoins
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              startedAt.current = Date.now();
              frozenMs.current = 0;
              setStarted(true);
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
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
        <div
          className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums backdrop-blur ${
            frozen ? "bg-sky-500/90 text-white" : "bg-background/80"
          }`}
        >
          {frozen ? <Snowflake className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
          {formatClock(elapsed)}
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Floor {index + 1} of {puzzles.length} · {sceneLabel(current?.scene)}
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

      <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
        {puzzles.map((p, i) => (
          <div
            key={p.id}
            title={p.title}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-black ${
              i < index
                ? "bg-emerald-500 text-white"
                : i === index
                  ? "gradient-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      <div className="p-5 pt-2">
        {current?.story && (
          <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">
            {current.story}
          </p>
        )}
        <p className="mt-3 text-sm font-semibold">{current?.question}</p>

        {peek && (
          <div className="mt-2 text-[11px] font-semibold text-primary">
            Answer starts with “{peek}…”
          </div>
        )}

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

        <div className="mt-3 flex flex-wrap gap-1.5">
          {POWERUPS.map((p) => {
            const n = inventory[p.id] ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                title={p.description}
                onClick={() => void use(p.id)}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${
                  n > 0 ? "bg-muted" : "bg-muted/50 text-muted-foreground"
                }`}
              >
                <span className="text-sm">{p.emoji}</span>
                {n > 0 ? `×${n}` : `${p.price}c`}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShopOpen((s) => !s)}
            className="inline-flex items-center gap-1 rounded-xl bg-muted px-2.5 py-1.5 text-[11px] font-bold"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Shop
          </button>
        </div>

        {shopOpen && shop}

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
          Hints {hints} · Misses {wrong} · Keys {keys} · Shield {shield} · Bonus +{bonus} · max{" "}
          {ESCAPE_MAX_SCORE} pts
        </div>
      </div>
    </div>
  );
}
