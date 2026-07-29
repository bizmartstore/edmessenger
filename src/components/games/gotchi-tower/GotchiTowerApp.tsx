import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Castle,
  Coins,
  Heart,
  Loader2,
  Sparkles,
  Swords,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Voxel } from "@/lib/edgotchi";
import { VoxelPainter, VoxelPreview } from "@/components/games/edgotchi/VoxelPainter";
import {
  ATTR_LABELS,
  derivedStats,
  getTowerEvent,
  joinTowerByCode,
  listEventPlayers,
  listStudentTowerEvents,
  loadApprovedQuestionsForFloor,
  loadTowerAvatar,
  saveTowerAvatar,
  themeForFloor,
  towerWsUrl,
  updateTowerPlayer,
  xpToNextLevel,
  type TowerAvatar,
  type TowerEvent,
  type TowerPlayer,
  type TowerQuestion,
} from "@/lib/gotchi-tower";
import { awardGcoins } from "@/lib/gcoins";
import { cn } from "@/lib/utils";
import type { FloorInteractEvent } from "./floorScene";

type Screen = "hub" | "create" | "lobby" | "floor" | "battle";
type BattleMode = "monster" | "boss" | "pvp" | "chest" | "gate";

type PhaserBridge = {
  destroy: (removeCanvas?: boolean, noReturn?: boolean) => void;
  events: {
    emit: (event: string, ...args: unknown[]) => boolean;
    on: (event: string, fn: (...args: unknown[]) => void) => unknown;
    off: (event: string, fn: (...args: unknown[]) => void) => unknown;
  };
  scene: { start: (key: string, data?: unknown) => void };
};

const FALLBACK_QUESTIONS: TowerQuestion[] = [
  {
    question: "What is 7 × 8?",
    options: ["54", "56", "63", "64"],
    correct_index: 1,
    explanation: "7 × 8 = 56.",
    hint: "Think of 7 × 10 minus 7 × 2.",
    difficulty: "easy",
    category: "Math",
    competency: "Multiplication",
    estimated_seconds: 20,
    floor_min: 1,
    floor_max: 100,
    approved: true,
    sort_order: 0,
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"],
    correct_index: 1,
    explanation: "Mars appears reddish due to iron oxide.",
    hint: "Named after the Roman god of war.",
    difficulty: "easy",
    category: "Science",
    competency: "Solar system",
    estimated_seconds: 20,
    floor_min: 1,
    floor_max: 100,
    approved: true,
    sort_order: 1,
  },
  {
    question: "What is the capital of France?",
    options: ["Lyon", "Marseille", "Paris", "Nice"],
    correct_index: 2,
    explanation: "Paris is the capital and largest city of France.",
    hint: "Home of the Eiffel Tower.",
    difficulty: "easy",
    category: "Geography",
    competency: "World capitals",
    estimated_seconds: 15,
    floor_min: 1,
    floor_max: 100,
    approved: true,
    sort_order: 2,
  },
];

export function GotchiTowerApp({ onBack }: { onBack: () => void }) {
  const { user, profile } = useAuth();
  const [screen, setScreen] = useState<Screen>("hub");
  const [events, setEvents] = useState<TowerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [event, setEvent] = useState<TowerEvent | null>(null);
  const [player, setPlayer] = useState<TowerPlayer | null>(null);
  const [peers, setPeers] = useState<TowerPlayer[]>([]);
  const [questions, setQuestions] = useState<TowerQuestion[]>([]);
  const [quiz, setQuiz] = useState<TowerQuestion | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [battleMode, setBattleMode] = useState<BattleMode>("monster");
  const [foeName, setFoeName] = useState("Wardling");
  const [foeHp, setFoeHp] = useState(80);
  const [foeMaxHp, setFoeMaxHp] = useState(80);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<"attack" | "heal" | "skill" | null>(null);
  const [chat, setChat] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [avatar, setAvatar] = useState<TowerAvatar | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [gotchiName, setGotchiName] = useState("");
  const [creatingGotchi, setCreatingGotchi] = useState(false);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<"off" | "connecting" | "live" | "fallback">("off");

  const floorHostRef = useRef<HTMLDivElement>(null);
  const battleHostRef = useRef<HTMLDivElement>(null);
  const floorGameRef = useRef<PhaserBridge | null>(null);
  const battleGameRef = useRef<PhaserBridge | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const moveTimer = useRef<number | null>(null);

  const refreshEvents = useCallback(async () => {
    if (!profile?.selected_subject_id) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEvents(await listStudentTowerEvents(profile.selected_subject_id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load towers");
    } finally {
      setLoading(false);
    }
  }, [profile?.selected_subject_id]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAvatarLoading(true);
    void loadTowerAvatar(user.id)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          setAvatar(row);
          setVoxels(row.voxels);
          setGotchiName(row.name);
        } else {
          setAvatar(null);
        }
      })
      .catch(() => {
        if (!cancelled) setAvatar(null);
      })
      .finally(() => {
        if (!cancelled) setAvatarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    return () => {
      floorGameRef.current?.destroy(true);
      battleGameRef.current?.destroy(true);
      wsRef.current?.close();
      if (moveTimer.current) window.clearTimeout(moveTimer.current);
    };
  }, []);

  async function handleSaveAvatar() {
    if (!user || creatingGotchi) return;
    setCreatingGotchi(true);
    try {
      const row = await saveTowerAvatar(user.id, gotchiName, voxels);
      setAvatar(row);
      setVoxels(row.voxels);
      toast.success("Tower Gotchi saved");
      if (pendingJoinCode) {
        const codeToJoin = pendingJoinCode;
        setPendingJoinCode(null);
        setScreen("hub");
        await completeJoin(codeToJoin, row);
      } else {
        setScreen("hub");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save Gotchi");
    } finally {
      setCreatingGotchi(false);
    }
  }

  async function completeJoin(rawCode: string, av?: TowerAvatar | null) {
    const useAvatar = av ?? avatar;
    if (!useAvatar) {
      setPendingJoinCode(rawCode.trim().toUpperCase());
      setScreen("create");
      toast.message("Create your Gotchi Tower avatar first");
      return;
    }
    setJoining(true);
    try {
      const row = await joinTowerByCode(rawCode, {
        gotchiName: useAvatar.name,
        voxels: useAvatar.voxels,
      });
      const ev =
        events.find((x) => x.id === row.event_id) ??
        (await getTowerEvent(row.event_id).catch(() => null));
      if (!ev) {
        // Still enter lobby with minimal event from player row
        setEvent({
          id: row.event_id,
          code: rawCode.trim().toUpperCase(),
          title: "Gotchi Tower",
          subject_id: profile?.selected_subject_id || "",
          created_by: "",
          difficulty: "mixed",
          floor_count: 20,
          player_limit: 30,
          gcoin_reward: 25,
          pvp_enabled: true,
          pvp_wager_min: 0,
          pvp_wager_max: 50,
          status: "lobby",
          theme: "academy",
          published_at: null,
          started_at: null,
          ended_at: null,
        });
      } else {
        setEvent(ev);
      }
      setPlayer(row);
      setVoxels(row.voxels?.length ? row.voxels : useAvatar.voxels);
      try {
        setPeers(await listEventPlayers(row.event_id));
      } catch {
        setPeers([row]);
      }
      setScreen("lobby");
      toast.success("Entered the tower lobby");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not join";
      toast.error(msg.length > 120 ? `${msg.slice(0, 117)}…` : msg);
    } finally {
      setJoining(false);
    }
  }

  async function handleJoin(e?: React.FormEvent, joinCode?: string) {
    e?.preventDefault();
    if (!user || joining) return;
    const raw = (joinCode || code).trim();
    if (raw.length < 4) {
      toast.error("Enter a valid game code");
      return;
    }
    if (!avatar) {
      setPendingJoinCode(raw.toUpperCase());
      setScreen("create");
      return;
    }
    await completeJoin(raw);
  }

  function connectRealtime(ev: TowerEvent, pl: TowerPlayer) {
    wsRef.current?.close();
    setWsStatus("connecting");
    void (async () => {
      const { data } = await import("@/integrations/supabase/client").then((m) =>
        m.supabase.auth.getSession(),
      );
      const token = data.session?.access_token;
      if (!token) {
        setWsStatus("fallback");
        return;
      }
      const url = towerWsUrl(ev.id, token);
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          setWsStatus("live");
          ws.send(
            JSON.stringify({
              type: "hello",
              userId: pl.user_id,
              name: pl.display_name,
              floor: pl.floor,
              x: pl.pos_x,
              y: pl.pos_y,
              voxels: pl.voxels,
            }),
          );
        };
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(String(msg.data)) as Record<string, unknown>;
            if (data.type === "presence" && Array.isArray(data.players)) {
              floorGameRef.current?.events.emit("gt-peers", data.players);
            }
            if (data.type === "move") {
              floorGameRef.current?.events.emit("gt-peer-move", data);
            }
            if (data.type === "chat") {
              setChat((c) => [...c.slice(-40), `${data.name}: ${data.text}`]);
            }
            if (data.type === "challenge") {
              if (data.to === pl.user_id) {
                toast.message(`${data.from} challenged you!`, {
                  action: {
                    label: "Accept",
                    onClick: () => {
                      ws.send(
                        JSON.stringify({
                          type: "challenge_response",
                          from: data.from,
                          accept: true,
                          wager: data.wager ?? 0,
                        }),
                      );
                      void beginBattle("pvp", String(data.from));
                    },
                  },
                });
              }
            }
          } catch {
            // ignore
          }
        };
        ws.onerror = () => setWsStatus("fallback");
        ws.onclose = () => {
          if (wsRef.current === ws) setWsStatus("fallback");
        };
      } catch {
        setWsStatus("fallback");
      }
    })();
  }

  async function enterFloor() {
    if (!event || !player) return;
    if (event.status === "lobby") {
      toast.message("Waiting for the teacher to start the tower…");
      // Allow explore preview in lobby for polish — still playable
    }
    try {
      const qs = await loadApprovedQuestionsForFloor(event.id, player.floor);
      setQuestions(qs.length ? qs : FALLBACK_QUESTIONS);
    } catch {
      setQuestions(FALLBACK_QUESTIONS);
    }
    setScreen("floor");
    connectRealtime(event, player);
  }

  useEffect(() => {
    if (screen !== "floor" || !player || !floorHostRef.current) return;
    let cancelled = false;
    floorGameRef.current?.destroy(true);
    floorGameRef.current = null;

    void import("./floorScene").then(({ createGotchiTowerFloorGame }) => {
      if (cancelled || !floorHostRef.current || !player) return;
      const game = createGotchiTowerFloorGame(floorHostRef.current, {
        floor: player.floor,
        floorCount: event?.floor_count ?? 20,
        voxels: player.voxels?.length ? player.voxels : voxels,
        playerName: player.gotchi_name || player.display_name,
        peers: peers
          .filter((p) => p.user_id !== player.user_id && p.floor === player.floor)
          .map((p) => ({
            userId: p.user_id,
            name: p.display_name,
            x: p.pos_x,
            y: p.pos_y,
            voxels: p.voxels,
          })),
      }) as unknown as PhaserBridge;
      floorGameRef.current = game;

      const onMove = (pos: { x: number; y: number; floor: number }) => {
        if (moveTimer.current) return;
        moveTimer.current = window.setTimeout(() => {
          moveTimer.current = null;
          wsRef.current?.readyState === WebSocket.OPEN &&
            wsRef.current.send(
              JSON.stringify({ type: "move", x: pos.x, y: pos.y, floor: pos.floor }),
            );
          if (player) {
            void updateTowerPlayer(player.id, { pos_x: pos.x, pos_y: pos.y }).catch(() => {});
          }
        }, 200);
      };
      const onInteract = (evt: FloorInteractEvent) => {
        void handleInteract(evt);
      };
      game.events.on("gt-player-move", onMove);
      game.events.on("gt-interact", onInteract);
    });

    return () => {
      cancelled = true;
      floorGameRef.current?.destroy(true);
      floorGameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, player?.id, player?.floor]);

  useEffect(() => {
    if (screen !== "battle" || !battleHostRef.current || !player) return;
    let cancelled = false;
    battleGameRef.current?.destroy(true);
    void import("./battleScene").then(({ createGotchiTowerBattleGame }) => {
      if (cancelled || !battleHostRef.current || !player) return;
      battleGameRef.current = createGotchiTowerBattleGame(battleHostRef.current, {
        playerName: player.gotchi_name,
        foeName,
        voxels: player.voxels?.length ? player.voxels : voxels,
        isBoss: battleMode === "boss",
        isPvp: battleMode === "pvp",
      }) as unknown as PhaserBridge;
    });
    return () => {
      cancelled = true;
      battleGameRef.current?.destroy(true);
      battleGameRef.current = null;
    };
  }, [screen, battleMode, foeName, player, voxels]);

  function pickQuestion(): TowerQuestion {
    const pool = questions.length ? questions : FALLBACK_QUESTIONS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function handleInteract(evt: FloorInteractEvent) {
    if (!player || !event) return;
    if (evt.kind === "portal") {
      openQuiz("gate", "Ascending Portal");
      return;
    }
    if (evt.kind === "quiz_gate") {
      openQuiz("gate", "Quiz Gate");
      return;
    }
    if (evt.kind === "chest") {
      openQuiz("chest", "Treasure Seal");
      return;
    }
    if (evt.kind === "heal") {
      const healed = Math.min(player.max_hp, player.hp + 25 + player.harmony);
      const next = { ...player, hp: healed, energy: Math.min(player.max_energy, player.energy + 15) };
      setPlayer(next);
      await updateTowerPlayer(player.id, { hp: next.hp, energy: next.energy });
      toast.success("Harmony restored your Gotchi");
      return;
    }
    if (evt.kind === "merchant") {
      toast.message("Merchant: trade cosmetics & materials coming soon — keep climbing!");
      return;
    }
    if (evt.kind === "monster") {
      await beginBattle(player.floor % 10 === 0 ? "boss" : "monster", evt.name);
      return;
    }
    if (evt.kind === "challenge_peer") {
      if (!event.pvp_enabled) {
        toast.error("PvP is disabled for this event");
        return;
      }
      wsRef.current?.send(
        JSON.stringify({ type: "challenge", to: evt.userId, wager: event.pvp_wager_min }),
      );
      toast.message(`Challenge sent to ${evt.name}`);
    }
  }

  function openQuiz(mode: BattleMode, label: string) {
    setBattleMode(mode);
    setFoeName(label);
    setQuiz(pickQuestion());
    setQuizOpen(true);
    setPendingAction("attack");
  }

  async function beginBattle(mode: BattleMode, name: string) {
    if (!player) return;
    setBattleMode(mode);
    setFoeName(name);
    const max = mode === "boss" ? 160 + player.floor * 4 : mode === "pvp" ? 100 : 60 + player.floor * 3;
    setFoeMaxHp(max);
    setFoeHp(max);
    setBattleLog([`${name} appears! Answer quizzes to fight.`]);
    setScreen("battle");
    setQuiz(pickQuestion());
    setQuizOpen(true);
    setPendingAction("attack");
  }

  async function answerQuiz(index: number) {
    if (!quiz || !player || !pendingAction) return;
    const correct = index === quiz.correct_index;
    setQuizOpen(false);

    let next = { ...player };
    if (correct) {
      next.correct_answers += 1;
      next.xp += 10 + Math.floor(player.floor / 2);
      next.gcoins_earned += battleMode === "chest" ? 3 : 1;
      while (next.xp >= xpToNextLevel(next.level)) {
        next.xp -= xpToNextLevel(next.level);
        next.level += 1;
        next.knowledge += 1;
        next.resolve += 1;
        if (next.level % 2 === 0) next.insight += 1;
        if (next.level % 3 === 0) next.spirit += 1;
        if (next.level % 4 === 0) next.harmony += 1;
        if (next.level % 5 === 0) next.agility += 1;
        const stats = derivedStats({
          knowledge: next.knowledge,
          resolve: next.resolve,
          agility: next.agility,
          insight: next.insight,
          spirit: next.spirit,
          harmony: next.harmony,
        });
        next.max_hp = stats.maxHp;
        next.max_energy = stats.maxEnergy;
        next.hp = Math.min(next.max_hp, next.hp + 10);
      }
      toast.success(quiz.explanation || "Correct!");
    } else {
      next.wrong_answers += 1;
      toast.error(quiz.explanation || "Incorrect — the foe retaliates!");
    }

    if (battleMode === "gate" || battleMode === "chest") {
      if (correct) {
        if (battleMode === "gate") {
          next.floor = Math.min(event?.floor_count ?? 20, next.floor + 1);
          toast.success(`Ascended to floor ${next.floor} · ${themeForFloor(next.floor).name}`);
          wsRef.current?.send(JSON.stringify({ type: "floor_advance", floor: next.floor }));
          awardGcoins("complete_reviewer", `gt-floor-${event?.id}-${next.floor}`);
        } else {
          next.inventory = [...next.inventory, { id: `relic-${Date.now()}`, name: "Tower Relic" }];
          toast.success("Treasure unlocked!");
        }
      }
      setPlayer(next);
      await updateTowerPlayer(player.id, {
        correct_answers: next.correct_answers,
        wrong_answers: next.wrong_answers,
        xp: next.xp,
        level: next.level,
        floor: next.floor,
        gcoins_earned: next.gcoins_earned,
        knowledge: next.knowledge,
        resolve: next.resolve,
        agility: next.agility,
        insight: next.insight,
        spirit: next.spirit,
        harmony: next.harmony,
        hp: next.hp,
        max_hp: next.max_hp,
        max_energy: next.max_energy,
        inventory: next.inventory,
      });
      setPendingAction(null);
      if (battleMode === "gate" && correct) {
        setScreen("floor");
      }
      return;
    }

    // Combat resolution
    const stats = derivedStats({
      knowledge: next.knowledge,
      resolve: next.resolve,
      agility: next.agility,
      insight: next.insight,
      spirit: next.spirit,
      harmony: next.harmony,
    });

    if (pendingAction === "heal") {
      if (correct) {
        const heal = Math.floor(stats.healPower);
        next.hp = Math.min(next.max_hp, next.hp + heal);
        next.energy = Math.max(0, next.energy - 8);
        setBattleLog((l) => [...l, `Harmony pulse heals ${heal} HP.`]);
        battleGameRef.current?.events.emit("gt-battle-vfx", { type: "heal", amount: heal });
      } else {
        next.hp = Math.max(0, next.hp - 8);
        setBattleLog((l) => [...l, "Heal fizzled — foe strikes!"]);
      }
    } else {
      const dmg = correct
        ? Math.floor(stats.skillPower * (pendingAction === "skill" ? 1.4 : 1) * (Math.random() < stats.critChance ? 1.6 : 1))
        : Math.floor(4 + Math.random() * 5);
      const newFoe = Math.max(0, foeHp - dmg);
      setFoeHp(newFoe);
      setBattleLog((l) => [
        ...l,
        correct
          ? `Quiz strike deals ${dmg} damage!`
          : `Missed quiz — weak hit for ${dmg}.`,
      ]);
      battleGameRef.current?.events.emit("gt-battle-vfx", {
        type: "hit",
        target: "enemy",
        amount: dmg,
      });
      if (!correct) {
        const retal = 8 + Math.floor(player.floor / 2);
        next.hp = Math.max(0, next.hp - retal);
        battleGameRef.current?.events.emit("gt-battle-vfx", {
          type: "hit",
          target: "player",
          amount: retal,
        });
        setBattleLog((l) => [...l, `${foeName} retaliates for ${retal}!`]);
      } else if (newFoe > 0) {
        const retal = Math.max(4, 10 + Math.floor(player.floor / 3) - Math.floor(stats.defense / 4));
        next.hp = Math.max(0, next.hp - retal);
        battleGameRef.current?.events.emit("gt-battle-vfx", {
          type: "hit",
          target: "player",
          amount: retal,
        });
      }

      if (newFoe <= 0) {
        next.battles_won += 1;
        next.xp += battleMode === "boss" ? 40 : 18;
        next.gcoins_earned += battleMode === "boss" ? 10 : 3;
        battleGameRef.current?.events.emit("gt-battle-vfx", { type: "win" });
        toast.success(`${foeName} defeated!`);
        if (battleMode === "boss") {
          next.floor = Math.min(event?.floor_count ?? 20, next.floor + 1);
          next.titles = [...new Set([...next.titles, `Guardian Slayer ${player.floor}`])];
          awardGcoins("complete_reviewer", `gt-boss-${event?.id}-${player.floor}`);
        }
        setPlayer(next);
        await persistPlayer(next);
        setTimeout(() => setScreen("floor"), 800);
        setPendingAction(null);
        return;
      }
    }

    if (next.hp <= 0) {
      next.battles_lost += 1;
      next.hp = Math.max(20, Math.floor(next.max_hp * 0.35));
      battleGameRef.current?.events.emit("gt-battle-vfx", { type: "lose" });
      toast.error("Your Gotchi was overwhelmed — retreat to recover.");
      setPlayer(next);
      await persistPlayer(next);
      setTimeout(() => setScreen("floor"), 800);
      setPendingAction(null);
      return;
    }

    setPlayer(next);
    await persistPlayer(next);
    setPendingAction(null);
  }

  async function persistPlayer(next: TowerPlayer) {
    await updateTowerPlayer(next.id, {
      correct_answers: next.correct_answers,
      wrong_answers: next.wrong_answers,
      xp: next.xp,
      level: next.level,
      floor: next.floor,
      gcoins_earned: next.gcoins_earned,
      knowledge: next.knowledge,
      resolve: next.resolve,
      agility: next.agility,
      insight: next.insight,
      spirit: next.spirit,
      harmony: next.harmony,
      hp: next.hp,
      max_hp: next.max_hp,
      energy: next.energy,
      max_energy: next.max_energy,
      battles_won: next.battles_won,
      battles_lost: next.battles_lost,
      titles: next.titles,
      inventory: next.inventory,
    }).catch(() => {});
  }

  function startCombatAction(action: "attack" | "heal" | "skill") {
    setPendingAction(action);
    setQuiz(pickQuestion());
    setQuizOpen(true);
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    wsRef.current?.send(JSON.stringify({ type: "chat", text }));
    setChat((c) => [...c.slice(-40), `You: ${text}`]);
    setChatInput("");
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (screen === "hub") onBack();
            else if (screen === "create") {
              setPendingJoinCode(null);
              setScreen("hub");
            } else if (screen === "floor" || screen === "battle") setScreen("lobby");
            else setScreen("hub");
          }}
          className="grid h-9 w-9 place-items-center rounded-xl bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 via-rose-500 to-indigo-600 text-white shadow-glow">
          <Castle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight">Gotchi Tower</h1>
          <p className="text-[11px] text-muted-foreground truncate">
            Quiz-powered academy climb · Knowledge · Resolve · Agility · Insight · Spirit · Harmony
          </p>
        </div>
        {wsStatus !== "off" && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              wsStatus === "live"
                ? "bg-emerald-500/15 text-emerald-700"
                : wsStatus === "connecting"
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {wsStatus === "live" ? "Online" : wsStatus === "connecting" ? "Sync…" : "Solo sync"}
          </span>
        )}
      </header>

      {screen === "create" && (
        <div className="space-y-3">
          <Panel className="bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-indigo-500/15">
            <div className="text-sm font-bold">Create your Tower Gotchi</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Separate from EdGotchi — this avatar is only used inside Gotchi Tower.
              {pendingJoinCode ? ` Then you will join code ${pendingJoinCode}.` : ""}
            </p>
          </Panel>
          <input
            value={gotchiName}
            onChange={(e) => setGotchiName(e.target.value)}
            placeholder="Gotchi name"
            maxLength={24}
            className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
          />
          <VoxelPainter
            initial={voxels}
            onChange={setVoxels}
            caption="cubes · your Gotchi Tower avatar"
          />
          <div className="flex justify-center">
            <VoxelPreview voxels={voxels} size={10} />
          </div>
          <button
            type="button"
            disabled={creatingGotchi || gotchiName.trim().length < 2 || voxels.length < 4}
            onClick={() => void handleSaveAvatar()}
            className="w-full rounded-2xl py-3 text-sm font-bold gradient-primary text-primary-foreground shadow-glow disabled:opacity-40"
          >
            {creatingGotchi ? "Saving…" : pendingJoinCode ? "Save & join tower" : "Save Tower Gotchi"}
          </button>
        </div>
      )}

      {screen === "hub" && (
        <div className="space-y-3">
          {!profile?.selected_subject_id && (
            <Panel>
              <p className="text-sm text-amber-800">
                Select a subject in My Account so matching Gotchi Tower events appear here.
              </p>
            </Panel>
          )}

          {avatarLoading ? (
            <div className="grid place-items-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : avatar ? (
            <Panel className="flex items-center gap-3">
              <VoxelPreview voxels={avatar.voxels} size={7} />
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{avatar.name}</div>
                <div className="text-[11px] text-muted-foreground">Your Tower Gotchi</div>
              </div>
              <button
                type="button"
                onClick={() => setScreen("create")}
                className="rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold"
              >
                Edit
              </button>
            </Panel>
          ) : (
            <Panel>
              <p className="text-sm mb-2">
                Create a <strong>Tower Gotchi</strong> (separate from EdGotchi) before climbing.
              </p>
              <button
                type="button"
                onClick={() => setScreen("create")}
                className="w-full rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground"
              >
                Create Tower Gotchi
              </button>
            </Panel>
          )}

          <form onSubmit={(e) => void handleJoin(e)} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Game code"
              maxLength={12}
              className="flex-1 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-semibold tracking-widest outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={joining || code.trim().length < 4}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:opacity-40"
            >
              {joining ? "…" : "Join"}
            </button>
          </form>

          {loading ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <Panel>
              <p className="text-sm text-muted-foreground">
                No live towers for your subject yet. Ask your teacher to publish a Gotchi Tower event, or join with a code.
              </p>
            </Panel>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => void handleJoin(undefined, ev.code)}
                  className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-card transition hover:shadow-glow"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{ev.title}</div>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      {ev.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Code {ev.code} · {ev.floor_count} floors · {ev.difficulty} · {ev.gcoin_reward} GCoins
                    {ev.pvp_enabled ? " · PvP on" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {screen === "lobby" && player && event && (
        <div className="space-y-3">
          <Panel className="bg-gradient-to-br from-indigo-600/90 via-violet-600/90 to-amber-500/80 text-white border-0">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/80">Lobby</div>
            <div className="text-xl font-extrabold">{event.title}</div>
            <div className="mt-1 text-sm text-white/90">
              Code <span className="font-mono font-bold">{event.code}</span> · Floor {player.floor}/{event.floor_count}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Chip icon={<Users className="h-3 w-3" />}>{peers.length} climbers</Chip>
              <Chip icon={<Coins className="h-3 w-3" />}>{player.gcoins_earned} earned</Chip>
              <Chip icon={<Sparkles className="h-3 w-3" />}>Lv {player.level}</Chip>
            </div>
          </Panel>

          <Panel>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Attributes</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(ATTR_LABELS) as Array<keyof typeof ATTR_LABELS>).map((k) => (
                <div key={k} className="rounded-xl bg-muted px-2.5 py-2">
                  <div className="text-[10px] font-semibold text-muted-foreground">{ATTR_LABELS[k].label}</div>
                  <div className="text-lg font-extrabold">{player[k]}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Companions</div>
              <span className="text-[10px] text-muted-foreground">Team of {player.companions.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {player.companions.map((c) => (
                <span key={c.def_id} className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-800">
                  {c.def_id} · Lv{c.level}
                </span>
              ))}
            </div>
          </Panel>

          <div className="rounded-2xl border border-border bg-card p-3 max-h-36 overflow-y-auto text-xs space-y-1">
            {peers.slice(0, 12).map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="font-medium">{p.display_name}</span>
                <span className="text-muted-foreground">Fl.{p.floor} · Lv{p.level}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void enterFloor()}
            className="w-full rounded-2xl py-3 text-sm font-bold gradient-primary text-primary-foreground shadow-glow"
          >
            Enter the Tower
          </button>
        </div>
      )}

      {screen === "floor" && player && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Heart className="h-3.5 w-3.5 text-rose-500" />
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${(player.hp / player.max_hp) * 100}%` }} />
            </div>
            <span className="font-semibold">{player.hp}/{player.max_hp}</span>
            <Zap className="h-3.5 w-3.5 text-sky-500" />
            <span className="font-semibold">{player.energy}</span>
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-semibold">{player.gcoins_earned}</span>
          </div>
          <div
            ref={floorHostRef}
            className="w-full overflow-hidden rounded-2xl border border-border bg-[#0b1220] shadow-card"
            style={{ minHeight: 360 }}
          />
          <form onSubmit={sendChat} className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Floor chat…"
              className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm outline-none"
            />
            <button type="submit" className="rounded-xl bg-muted px-3 text-xs font-semibold">
              Send
            </button>
          </form>
          {chat.length > 0 && (
            <div className="max-h-20 overflow-y-auto rounded-xl bg-muted/60 px-2 py-1 text-[11px] space-y-0.5">
              {chat.slice(-6).map((line, i) => (
                <div key={`${i}-${line}`}>{line}</div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            Move with WASD / arrows / touch · Press E near portals, chests, monsters & peers
          </p>
        </div>
      )}

      {screen === "battle" && player && (
        <div className="space-y-2">
          <div ref={battleHostRef} className="w-full overflow-hidden rounded-2xl border border-border bg-[#0b1220]" />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatBar label={player.gotchi_name} value={player.hp} max={player.max_hp} color="bg-rose-500" />
            <StatBar label={foeName} value={foeHp} max={foeMaxHp} color="bg-violet-500" />
          </div>
          <div className="max-h-24 overflow-y-auto rounded-xl bg-muted px-3 py-2 text-[11px] space-y-0.5">
            {battleLog.slice(-8).map((l, i) => (
              <div key={`${i}-${l}`}>{l}</div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => startCombatAction("attack")} className="rounded-xl py-2.5 text-xs font-bold bg-rose-500/15 text-rose-800">
              <Swords className="inline h-3.5 w-3.5 mr-1" /> Attack
            </button>
            <button type="button" onClick={() => startCombatAction("skill")} className="rounded-xl py-2.5 text-xs font-bold bg-indigo-500/15 text-indigo-800">
              <Sparkles className="inline h-3.5 w-3.5 mr-1" /> Skill
            </button>
            <button type="button" onClick={() => startCombatAction("heal")} className="rounded-xl py-2.5 text-xs font-bold bg-emerald-500/15 text-emerald-800">
              <Heart className="inline h-3.5 w-3.5 mr-1" /> Heal
            </button>
          </div>
        </div>
      )}

      {quizOpen && quiz && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/50 p-3">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-glow animate-fade-up">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">
              {quiz.category} · {quiz.difficulty}
              {quiz.hint ? ` · Hint: ${quiz.hint}` : ""}
            </div>
            <div className="text-sm font-bold leading-snug mb-3">{quiz.question}</div>
            <div className="grid gap-2">
              {quiz.options.map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  type="button"
                  onClick={() => void answerQuiz(i)}
                  className="rounded-xl border border-border bg-muted px-3 py-2.5 text-left text-sm font-medium hover:border-primary hover:bg-primary/5"
                >
                  <span className="mr-2 font-bold text-primary">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-card", className)}>
      {children}
    </div>
  );
}

function Chip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-semibold">
      {icon}
      {children}
    </span>
  );
}

function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-semibold">
        <span className="truncate">{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", color)} style={{ width: `${Math.max(0, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
