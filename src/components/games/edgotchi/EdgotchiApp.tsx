import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Coins, Heart, Sparkles, Swords, Map as MapIcon, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  MAPS,
  SKILLS,
  getMap,
  type EdgotchiRow,
  type QuizQ,
  type SkillId,
  type Voxel,
  type WildGotchi,
  createEdgotchi,
  enemyForMap,
  loadBattleQuestions,
  loadEdgotchi,
  saveEdgotchiProgress,
  skillsForLevel,
  xpToNext,
} from "@/lib/edgotchi";
import { VoxelPainter, VoxelPreview } from "./VoxelPainter";
import { cn } from "@/lib/utils";

type PhaserBridge = {
  destroy: (removeCanvas?: boolean, noReturn?: boolean) => void;
  events: {
    emit: (event: string, ...args: unknown[]) => boolean;
    on: (event: string, fn: (...args: unknown[]) => void) => unknown;
    off: (event: string, fn: (...args: unknown[]) => void) => unknown;
  };
};

type BattleVfx =
  | { type: "skill"; skill: SkillId; from: "player" | "enemy" }
  | { type: "hit"; target: "player" | "enemy"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "shield" }
  | { type: "win" }
  | { type: "lose" };

function emitVfx(game: PhaserBridge | null, evt: BattleVfx) {
  game?.events.emit("edgotchi-vfx", evt);
}

type Screen = "loading" | "create" | "hub" | "explore" | "battle";

type BattleFoe = {
  name: string;
  maxHp: number;
  hp: number;
  power: number;
  voxels?: Voxel[];
  tokenReward: number;
  wildId?: string;
};

export function EdgotchiApp({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [screen, setScreen] = useState<Screen>("loading");
  const [pet, setPet] = useState<EdgotchiRow | null>(null);
  const [name, setName] = useState("");
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [creating, setCreating] = useState(false);
  const [mapId, setMapId] = useState("campus");
  const [foe, setFoe] = useState<BattleFoe | null>(null);
  const [defeatedIds, setDefeatedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await loadEdgotchi(user.id);
        if (cancelled) return;
        if (row) {
          setPet(row);
          setMapId(row.map_id);
          setScreen("hub");
        } else {
          setScreen("create");
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Could not load Edgotchi");
          setScreen("create");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleCreate() {
    if (!user || creating) return;
    setCreating(true);
    try {
      const row = await createEdgotchi(user.id, name, voxels);
      setPet(row);
      setScreen("hub");
      toast.success(`${row.name} is ready forever!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create Edgotchi");
    } finally {
      setCreating(false);
    }
  }

  if (screen === "loading") {
    return (
      <div className="grid min-h-[420px] place-items-center text-sm text-muted-foreground">
        Loading Edgotchi…
      </div>
    );
  }

  if (screen === "create") {
    return (
      <div className="space-y-4">
        <Header title="Create your Edgotchi" onBack={onBack} />
        <p className="text-xs text-muted-foreground">
          Build a virtual pet with cubes. Once saved, it stays on your account permanently.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="Name your Edgotchi"
          className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <VoxelPainter onChange={setVoxels} />
        <button
          type="button"
          disabled={creating}
          onClick={() => void handleCreate()}
          className="w-full rounded-2xl py-3 font-semibold gradient-primary text-primary-foreground shadow-glow disabled:opacity-40"
        >
          {creating ? "Saving…" : "Hatch Edgotchi"}
        </button>
      </div>
    );
  }

  if (!pet) return null;

  if (screen === "explore") {
    return (
      <ExploreScreen
        pet={pet}
        mapId={mapId}
        defeatedIds={defeatedIds}
        onMap={(id) => {
          setMapId(id);
          setDefeatedIds([]);
        }}
        onBack={() => setScreen("hub")}
        onEncounter={(wild) => {
          setFoe({
            name: wild.name,
            maxHp: wild.maxHp,
            hp: wild.hp,
            power: wild.power,
            voxels: wild.voxels,
            tokenReward: wild.tokenReward,
            wildId: wild.id,
          });
          setScreen("battle");
        }}
        onSaveMap={async (id) => {
          const next = await saveEdgotchiProgress({ ...pet, map_id: id });
          setPet(next);
        }}
      />
    );
  }

  if (screen === "battle") {
    const battleFoe: BattleFoe =
      foe ??
      (() => {
        const e = enemyForMap(mapId, pet.level);
        return {
          name: e.name,
          maxHp: e.maxHp,
          hp: e.hp,
          power: e.power,
          voxels: e.voxels,
          tokenReward: e.tokenReward,
        };
      })();
    return (
      <BattleScreen
        pet={pet}
        mapId={mapId}
        foe={battleFoe}
        onDone={(next, won) => {
          setPet(next);
          if (won && battleFoe.wildId) {
            const id = battleFoe.wildId;
            setDefeatedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
          }
          setFoe(null);
          setScreen(battleFoe.wildId ? "explore" : "hub");
        }}
        onBack={() => {
          setFoe(null);
          setScreen(foe?.wildId ? "explore" : "hub");
        }}
      />
    );
  }

  return (
    <HubScreen
      pet={pet}
      onBack={onBack}
      onExplore={() => setScreen("explore")}
      onBattle={() => {
        const e = enemyForMap(mapId, pet.level);
        setFoe({
          name: e.name,
          maxHp: e.maxHp,
          hp: e.hp,
          power: e.power,
          voxels: e.voxels,
          tokenReward: e.tokenReward,
        });
        setScreen("battle");
      }}
    />
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} className="rounded-xl bg-muted p-2 hover:bg-secondary">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h2 className="font-bold text-lg">{title}</h2>
    </div>
  );
}

function StatBar({
  label,
  value,
  max,
  color,
  icon,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  icon: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {icon} {label}
        </span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HubScreen({
  pet,
  onBack,
  onExplore,
  onBattle,
}: {
  pet: EdgotchiRow;
  onBack: () => void;
  onExplore: () => void;
  onBattle: () => void;
}) {
  const unlocked = skillsForLevel(pet.level);
  const map = getMap(pet.map_id);
  return (
    <div className="space-y-4">
      <Header title={pet.name} onBack={onBack} />
      <div className="rounded-3xl border border-border bg-gradient-to-br from-violet-600/20 via-card to-amber-500/10 p-4 shadow-card">
        <div className="flex items-center gap-4">
          <VoxelPreview voxels={pet.voxels} size={9} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-xs font-semibold text-primary">Level {pet.level}</div>
            <div className="text-[10px] text-muted-foreground">
              XP {pet.xp}/{xpToNext(pet.level)} · Wins {pet.wins}/{pet.battles}
            </div>
            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
              <Coins className="h-3 w-3" /> {pet.gotchi_tokens ?? 0} Gotchi Tokens
            </div>
            <StatBar label="HP" value={pet.hp} max={pet.max_hp} color="bg-rose-500" icon={<Heart className="h-3 w-3" />} />
            <StatBar label="Mana" value={pet.mana} max={pet.max_mana} color="bg-sky-500" icon={<Zap className="h-3 w-3" />} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
        Last map: <span className="font-semibold text-foreground">{map.name}</span> · open-world explore with wild Gotchis
      </div>

      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Skills</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.values(SKILLS).map((s) => {
            const on = unlocked.includes(s.id);
            return (
              <span
                key={s.id}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[10px] font-semibold",
                  on ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground opacity-60",
                )}
                title={s.description}
              >
                {s.name}
                {!on && ` · Lv${s.unlockLevel}`}
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onExplore}
          className="rounded-2xl border border-border bg-card py-3 text-sm font-semibold shadow-card inline-flex items-center justify-center gap-2"
        >
          <MapIcon className="h-4 w-4 text-primary" /> Explore
        </button>
        <button
          type="button"
          onClick={onBattle}
          className="rounded-2xl py-3 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow inline-flex items-center justify-center gap-2"
        >
          <Swords className="h-4 w-4" /> Quick Battle
        </button>
      </div>
      <p className="text-[10px] text-center text-muted-foreground">
        Walk the open map, battle wild Gotchis, earn Gotchi Tokens. All world art is procedural — no extra AI quota.
      </p>
    </div>
  );
}

function ExploreScreen({
  pet,
  mapId,
  defeatedIds,
  onMap,
  onBack,
  onEncounter,
  onSaveMap,
}: {
  pet: EdgotchiRow;
  mapId: string;
  defeatedIds: string[];
  onMap: (id: string) => void;
  onBack: () => void;
  onEncounter: (wild: WildGotchi) => void;
  onSaveMap: (id: string) => Promise<void>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserBridge | null>(null);
  const map = getMap(mapId);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof window === "undefined" || picking) return;
    let cancelled = false;
    let game: PhaserBridge | null = null;

    const onEnc = (...args: unknown[]) => {
      const evt = args[0] as { wild?: WildGotchi } | undefined;
      if (evt?.wild) onEncounter(evt.wild);
    };

    void import("./exploreScene").then(({ createEdgotchiExploreGame }) => {
      if (cancelled || !hostRef.current) return;
      const created = createEdgotchiExploreGame(hostRef.current, {
        mapId,
        voxels: pet.voxels,
        playerName: pet.name,
        playerLevel: pet.level,
        defeatedIds,
      }) as unknown as PhaserBridge;
      game = created;
      gameRef.current = created;
      created.events.on("edgotchi-encounter", onEnc);
    });

    return () => {
      cancelled = true;
      game?.events.off("edgotchi-encounter", onEnc);
      game?.destroy(true);
      gameRef.current = null;
    };
    // Remount when map changes; defeatedIds applied via resume when returning from battle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, picking]);

  // After battle return: tell scene which wild was defeated without full remount if same map
  useEffect(() => {
    const g = gameRef.current;
    if (!g || defeatedIds.length === 0) return;
    const last = defeatedIds[defeatedIds.length - 1];
    g.events.emit("edgotchi-explore-resume", { defeatedId: last });
  }, [defeatedIds]);

  return (
    <div className="space-y-3">
      <Header title={picking ? "Choose map" : map.name} onBack={picking ? () => setPicking(false) : onBack} />
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
          <Coins className="h-3 w-3" /> {pet.gotchi_tokens ?? 0} tokens
        </span>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="rounded-lg border border-border bg-muted px-2 py-1 font-semibold hover:border-primary"
        >
          {picking ? "Back to world" : "Switch map"}
        </button>
      </div>

      {picking ? (
        <div className="grid gap-2">
          {MAPS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onMap(m.id);
                void onSaveMap(m.id).catch(() => undefined);
                setPicking(false);
              }}
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                mapId === m.id ? "border-primary bg-primary/10 shadow-glow" : "border-border bg-card",
              )}
            >
              <div className="font-semibold text-sm">{m.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                ~{m.wildCount} wild Gotchis · day/night · {m.worldW}×{m.worldH}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div
            ref={hostRef}
            className="overflow-hidden rounded-2xl border border-border bg-slate-950 min-h-[320px]"
          />
          <p className="text-[10px] text-center text-muted-foreground">
            Move with WASD, arrows, or tap. Touch a wild Gotchi to start a quiz battle and earn tokens.
          </p>
        </>
      )}
    </div>
  );
}

function BattleScreen({
  pet,
  mapId,
  foe,
  onDone,
  onBack,
}: {
  pet: EdgotchiRow;
  mapId: string;
  foe: BattleFoe;
  onDone: (pet: EdgotchiRow, won: boolean) => void;
  onBack: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserBridge | null>(null);
  const [questions, setQuestions] = useState<QuizQ[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<"quiz" | "skill" | "enemy" | "end">("quiz");
  const [playerHp, setPlayerHp] = useState(pet.hp);
  const [playerMana, setPlayerMana] = useState(pet.mana);
  const [enemy, setEnemy] = useState(foe);
  const enemyHpRef = useRef(foe.hp);
  const [shield, setShield] = useState(false);
  const shieldRef = useRef(false);
  const [message, setMessage] = useState("Answer correctly to attack!");
  const [busy, setBusy] = useState(false);
  const map = getMap(mapId);

  useEffect(() => {
    enemyHpRef.current = enemy.hp;
  }, [enemy.hp]);

  useEffect(() => {
    shieldRef.current = shield;
  }, [shield]);

  useEffect(() => {
    let alive = true;
    void loadBattleQuestions(8).then((qs) => {
      if (alive) setQuestions(qs);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof window === "undefined") return;
    let cancelled = false;
    let game: PhaserBridge | null = null;
    void import("./battleScene").then(({ createEdgotchiBattleGame }) => {
      if (cancelled || !hostRef.current) return;
      const created = createEdgotchiBattleGame(hostRef.current, {
        voxels: pet.voxels,
        mapTint: map.tint,
        playerName: pet.name,
        enemyName: foe.name,
        enemyVoxels: foe.voxels,
      }) as unknown as PhaserBridge;
      game = created;
      gameRef.current = created;
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per battle
  }, []);

  const q = questions[qIndex % Math.max(1, questions.length)];

  async function finish(won: boolean) {
    setPhase("end");
    emitVfx(gameRef.current, { type: won ? "win" : "lose" });
    const xpGain = won ? 28 + pet.level * 4 : 8;
    const tokensGain = won ? foe.tokenReward : 0;
    let next: EdgotchiRow = {
      ...pet,
      hp: won ? Math.min(pet.max_hp, playerHp + 10) : Math.max(1, Math.floor(pet.max_hp * 0.4)),
      mana: Math.min(pet.max_mana, playerMana + (won ? 10 : 0)),
      xp: pet.xp + xpGain,
      wins: pet.wins + (won ? 1 : 0),
      battles: pet.battles + 1,
      map_id: mapId,
      gotchi_tokens: (pet.gotchi_tokens ?? 0) + tokensGain,
      skills: skillsForLevel(pet.level),
    };
    try {
      next = await saveEdgotchiProgress(next);
      toast.success(
        won
          ? `Victory! +${xpGain} XP · +${tokensGain} Gotchi Tokens`
          : `Defeated… +${xpGain} XP`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save progress");
    }
    window.setTimeout(() => onDone(next, won), 1200);
  }

  function afterPlayerAction(enemyHpNow: number) {
    if (enemyHpNow <= 0) {
      void finish(true);
      return;
    }
    setPhase("enemy");
    setBusy(true);
    window.setTimeout(() => {
      let dmg = enemy.power + Math.floor(Math.random() * 6);
      if (shieldRef.current) {
        dmg = Math.floor(dmg / 2);
        setShield(false);
      }
      setPlayerHp((h) => {
        const nh = Math.max(0, h - dmg);
        emitVfx(gameRef.current, { type: "hit", target: "player", amount: dmg });
        emitVfx(gameRef.current, { type: "skill", skill: "spark", from: "enemy" });
        setMessage(`${enemy.name} hits for ${dmg}!`);
        if (nh <= 0) {
          window.setTimeout(() => void finish(false), 600);
        } else {
          setQIndex((i) => i + 1);
          setPhase("quiz");
          setBusy(false);
        }
        return nh;
      });
    }, 700);
  }

  function castSkill(skill: SkillId) {
    if (busy || phase !== "skill") return;
    const def = SKILLS[skill];
    if (playerMana < def.mana) {
      toast.error("Not enough mana");
      return;
    }
    setBusy(true);
    setPlayerMana((m) => m - def.mana);
    emitVfx(gameRef.current, { type: "skill", skill, from: "player" });

    let enemyHpNow = enemyHpRef.current;
    if (skill === "heal") {
      const heal = Math.abs(def.power);
      setPlayerHp((h) => Math.min(pet.max_hp, h + heal));
      emitVfx(gameRef.current, { type: "heal", amount: heal });
      setMessage(`Healed ${heal} HP!`);
    } else if (skill === "shield") {
      setShield(true);
      emitVfx(gameRef.current, { type: "shield" });
      setMessage("Focus Shield armed!");
    } else {
      const dmg = def.power + Math.floor(pet.level * 1.5);
      enemyHpNow = Math.max(0, enemyHpRef.current - dmg);
      enemyHpRef.current = enemyHpNow;
      setEnemy((e) => ({ ...e, hp: enemyHpNow }));
      emitVfx(gameRef.current, { type: "hit", target: "enemy", amount: dmg });
      setMessage(`${def.name} deals ${dmg}!`);
    }
    window.setTimeout(() => {
      setBusy(false);
      afterPlayerAction(enemyHpNow);
    }, 650);
  }

  function answer(idx: number) {
    if (!q || busy || phase !== "quiz") return;
    setBusy(true);
    const ok = idx === q.correct_index;
    if (ok) {
      setMessage("Correct! Choose a skill.");
      setPlayerMana((m) => Math.min(pet.max_mana, m + 4));
      setPhase("skill");
      setBusy(false);
    } else {
      setMessage("Wrong answer — you stumble!");
      window.setTimeout(() => {
        setBusy(false);
        afterPlayerAction(enemyHpRef.current);
      }, 500);
    }
  }

  return (
    <div className="space-y-3">
      <Header title={`Battle · ${enemy.name}`} onBack={onBack} />
      <div ref={hostRef} className="overflow-hidden rounded-2xl border border-border bg-slate-950" />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{map.name}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
          <Coins className="h-3 w-3" /> Win +{foe.tokenReward} tokens
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <StatBar label={pet.name} value={playerHp} max={pet.max_hp} color="bg-rose-500" icon={<Heart className="h-3 w-3" />} />
        <StatBar label={enemy.name} value={enemy.hp} max={enemy.maxHp} color="bg-amber-500" icon={<Swords className="h-3 w-3" />} />
        <StatBar label="Mana" value={playerMana} max={pet.max_mana} color="bg-sky-500" icon={<Zap className="h-3 w-3" />} />
        <div className="rounded-xl bg-muted px-2 py-1.5 text-muted-foreground self-end">{message}</div>
      </div>

      {phase === "quiz" && q && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <div className="text-xs font-semibold leading-snug">{q.question}</div>
          <div className="grid gap-1.5">
            {q.options.map((opt, i) => (
              <button
                key={`${q.id}-${i}`}
                type="button"
                disabled={busy}
                onClick={() => answer(i)}
                className="rounded-xl border border-border bg-muted px-3 py-2 text-left text-xs font-medium hover:border-primary disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "skill" && (
        <div className="grid grid-cols-2 gap-1.5">
          {skillsForLevel(pet.level).map((id) => {
            const s = SKILLS[id];
            return (
              <button
                key={id}
                type="button"
                disabled={busy || playerMana < s.mana}
                onClick={() => castSkill(id)}
                className="rounded-xl border border-primary/25 bg-primary/10 px-2 py-2 text-left disabled:opacity-40"
              >
                <div className="text-[11px] font-bold text-primary inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> {s.name}
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  {s.mana > 0 ? `${s.mana} mana` : "Free"} · {s.description}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {(phase === "enemy" || phase === "end") && (
        <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
          {phase === "end" ? "Saving progress…" : "Enemy turn…"}
        </div>
      )}
    </div>
  );
}
