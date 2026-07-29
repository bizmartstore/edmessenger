/** Gotchi Tower — types, floors, RPG attributes, Supabase helpers. */

import { supabase } from "@/integrations/supabase/client";
import type { Voxel } from "@/lib/edgotchi";

export type TowerDifficulty = "easy" | "medium" | "hard" | "mixed";
export type TowerStatus = "draft" | "lobby" | "live" | "ended";
export type TowerRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type TowerElement = "arcane" | "nature" | "flame" | "tide" | "storm" | "crystal" | "spirit";

/** Original RPG attributes (not copied from other games). */
export type TowerAttrs = {
  knowledge: number; // skill effectiveness
  resolve: number; // health & defense
  agility: number; // speed & turn order
  insight: number; // crit & accuracy
  spirit: number; // energy regen & specials
  harmony: number; // resistance, healing, support
};

export const ATTR_LABELS: Record<keyof TowerAttrs, { label: string; blurb: string }> = {
  knowledge: { label: "Knowledge", blurb: "Skill power and quiz mastery" },
  resolve: { label: "Resolve", blurb: "Health and defense" },
  agility: { label: "Agility", blurb: "Movement and turn order" },
  insight: { label: "Insight", blurb: "Critical hits and accuracy" },
  spirit: { label: "Spirit", blurb: "Energy regen and ultimates" },
  harmony: { label: "Harmony", blurb: "Healing, resistance, support" },
};

export type FloorThemeId =
  | "training_hall"
  | "enchanted_library"
  | "crystal_garden"
  | "observatory"
  | "sky_temple"
  | "grand_academy"
  | "guardian_arena";

export type FloorTheme = {
  id: FloorThemeId;
  name: string;
  skyTop: number;
  skyBottom: number;
  ground: number;
  accent: number;
  glow: number;
  parallax: number[];
};

export const FLOOR_THEMES: FloorTheme[] = [
  {
    id: "training_hall",
    name: "Training Hall",
    skyTop: 0x1e3a5f,
    skyBottom: 0x3d6b9a,
    ground: 0x5c4a3a,
    accent: 0xf0c14a,
    glow: 0xffe08a,
    parallax: [0x2a4a6e, 0x3a5a7e, 0x4a6a8e],
  },
  {
    id: "enchanted_library",
    name: "Enchanted Library",
    skyTop: 0x2a1848,
    skyBottom: 0x5a3a8a,
    ground: 0x4a3050,
    accent: 0xc9a0ff,
    glow: 0xe8d0ff,
    parallax: [0x3a2858, 0x4a3868, 0x5a4878],
  },
  {
    id: "crystal_garden",
    name: "Crystal Garden",
    skyTop: 0x0d3d4a,
    skyBottom: 0x2a8a9a,
    ground: 0x2d5a4a,
    accent: 0x5ef0d0,
    glow: 0xa8fff0,
    parallax: [0x1a5a5a, 0x2a6a6a, 0x3a7a7a],
  },
  {
    id: "observatory",
    name: "Star Observatory",
    skyTop: 0x0a0a28,
    skyBottom: 0x1a2a5a,
    ground: 0x2a2a40,
    accent: 0x7ab8ff,
    glow: 0xd0e8ff,
    parallax: [0x12123a, 0x1a1a4a, 0x22225a],
  },
  {
    id: "sky_temple",
    name: "Sky Temple",
    skyTop: 0x3a6aaa,
    skyBottom: 0x8ec8f0,
    ground: 0xd8c8a8,
    accent: 0xffd060,
    glow: 0xfff0c0,
    parallax: [0x5a8aba, 0x6a9aca, 0x7aaada],
  },
  {
    id: "grand_academy",
    name: "Grand Academy",
    skyTop: 0x1a3050,
    skyBottom: 0x4a70a0,
    ground: 0x6a5040,
    accent: 0xf5c542,
    glow: 0xffe890,
    parallax: [0x2a4060, 0x3a5070, 0x4a6080],
  },
  {
    id: "guardian_arena",
    name: "Guardian Arena",
    skyTop: 0x3a1020,
    skyBottom: 0x8a3040,
    ground: 0x4a3040,
    accent: 0xff6080,
    glow: 0xffb0c0,
    parallax: [0x4a2030, 0x5a3040, 0x6a4050],
  },
];

export function themeForFloor(floor: number): FloorTheme {
  if (floor % 10 === 0) return FLOOR_THEMES.find((t) => t.id === "guardian_arena")!;
  const idx = ((floor - 1) % (FLOOR_THEMES.length - 1));
  return FLOOR_THEMES[idx];
}

export type TowerQuestion = {
  id?: string;
  event_id?: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  hint: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  competency: string;
  estimated_seconds: number;
  floor_min: number;
  floor_max: number;
  approved: boolean;
  sort_order: number;
};

export type TowerEvent = {
  id: string;
  code: string;
  title: string;
  subject_id: string;
  created_by: string;
  difficulty: TowerDifficulty;
  floor_count: number;
  player_limit: number;
  gcoin_reward: number;
  pvp_enabled: boolean;
  pvp_wager_min: number;
  pvp_wager_max: number;
  status: TowerStatus;
  theme: string;
  published_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at?: string;
  subjects?: { name: string } | null;
};

export type CompanionInstance = {
  def_id: string;
  level: number;
  xp: number;
};

/** Tower-only avatar — stored in gotchi_tower_avatars, never edgotchis. */
export type TowerAvatar = {
  user_id: string;
  name: string;
  voxels: Voxel[];
};

export type TowerPlayer = {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string;
  gotchi_name: string;
  voxels: Voxel[];
  floor: number;
  xp: number;
  level: number;
  knowledge: number;
  resolve: number;
  agility: number;
  insight: number;
  spirit: number;
  harmony: number;
  hp: number;
  max_hp: number;
  energy: number;
  max_energy: number;
  gcoins_earned: number;
  correct_answers: number;
  wrong_answers: number;
  battles_won: number;
  battles_lost: number;
  inventory: unknown[];
  companions: CompanionInstance[];
  equipment: Record<string, unknown>;
  titles: string[];
  online: boolean;
  pos_x: number;
  pos_y: number;
};

export type CompanionDef = {
  id: string;
  name: string;
  rarity: TowerRarity;
  element: TowerElement;
  passive: string;
  active_skill: string;
  base_knowledge: number;
  base_resolve: number;
  base_agility: number;
  base_insight: number;
  base_spirit: number;
  base_harmony: number;
  description: string;
};

export function generateTowerCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function derivedStats(attrs: TowerAttrs) {
  return {
    maxHp: 80 + attrs.resolve * 4 + attrs.harmony,
    maxEnergy: 30 + attrs.spirit * 3,
    critChance: Math.min(0.45, 0.05 + attrs.insight * 0.008),
    accuracy: Math.min(0.98, 0.7 + attrs.insight * 0.01),
    moveSpeed: 120 + attrs.agility * 4,
    skillPower: 8 + attrs.knowledge * 1.2,
    healPower: 6 + attrs.harmony * 1.1,
    defense: attrs.resolve * 0.8 + attrs.harmony * 0.4,
  };
}

export function xpToNextLevel(level: number): number {
  return 40 + level * 25;
}

/** Cost in tower-earned GCoins to redesign an existing Tower Gotchi. */
export const GOTCHI_EDIT_COST = 25;

export type FloorEnemyDef = {
  id: string;
  name: string;
  isBoss: boolean;
};

/** Enemies that must be cleared before ascending this floor. */
export function enemiesForFloor(floor: number): FloorEnemyDef[] {
  const isBossFloor = floor % 10 === 0;
  if (isBossFloor) {
    return [
      {
        id: `mob-${floor}-boss`,
        name: `Guardian of Floor ${floor}`,
        isBoss: true,
      },
    ];
  }
  const count = Math.min(4, 1 + Math.floor((floor - 1) / 3));
  const names = ["Wardling", "Shardling", "Tome Imp", "Crystal Bat", "Arcane Wisp"];
  return Array.from({ length: count }, (_, i) => ({
    id: `mob-${floor}-${i}`,
    name: `${names[i % names.length]} ${floor}`,
    isBoss: false,
  }));
}

export function foeMaxHpFor(
  floor: number,
  mode: "monster" | "boss" | "pvp",
): number {
  if (mode === "pvp") return 100 + floor * 2;
  if (mode === "boss") return 140 + floor * 12;
  return 45 + floor * 9;
}

/** Enemy retaliation — scales hard with floor level. */
export function foeRetaliationDamage(
  floor: number,
  mode: "monster" | "boss" | "pvp",
  defense: number,
  missedQuiz: boolean,
): number {
  const base = mode === "boss" ? 14 : mode === "pvp" ? 10 : 7;
  const perFloor = mode === "boss" ? 2.8 : 2.2;
  const scaled = base + Math.floor(floor * perFloor);
  const raw = missedQuiz ? scaled + 5 : scaled;
  return Math.max(4, Math.floor(raw - defense / 5));
}

export type TowerFloorProgress = { floor: number; defeated: string[] };

export function readFloorProgress(
  equipment: Record<string, unknown> | null | undefined,
  floor: number,
): string[] {
  const tp = equipment?.tower_progress as TowerFloorProgress | undefined;
  if (!tp || tp.floor !== floor || !Array.isArray(tp.defeated)) return [];
  return tp.defeated.map(String);
}

export function withFloorProgress(
  equipment: Record<string, unknown> | null | undefined,
  floor: number,
  defeated: string[],
): Record<string, unknown> {
  return { ...(equipment ?? {}), tower_progress: { floor, defeated } };
}

export type TowerLeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  gotchi_name: string;
  floor: number;
  level: number;
  battles_won: number;
  gcoins_earned: number;
  voxels: Voxel[];
};

/** Per-event climb board — highest floor, then wins, then earned GCoins. */
export function rankTowerPlayers(players: TowerPlayer[]): TowerLeaderboardEntry[] {
  return [...players]
    .sort((a, b) => {
      if (b.floor !== a.floor) return b.floor - a.floor;
      if (b.battles_won !== a.battles_won) return b.battles_won - a.battles_won;
      if (b.gcoins_earned !== a.gcoins_earned) return b.gcoins_earned - a.gcoins_earned;
      return b.level - a.level;
    })
    .map((p, i) => ({
      rank: i + 1,
      user_id: p.user_id,
      display_name: p.display_name,
      gotchi_name: p.gotchi_name,
      floor: p.floor,
      level: p.level,
      battles_won: p.battles_won,
      gcoins_earned: p.gcoins_earned,
      voxels: p.voxels,
    }));
}

export function randomQuizGateReward(floor: number) {
  return {
    xp: 12 + floor * 2,
    gcoins: 1 + Math.floor(floor / 5),
    materials: floor % 3 === 0 ? 1 : 0,
  };
}

function mapEvent(row: Record<string, unknown>): TowerEvent {
  return {
    id: String(row.id),
    code: String(row.code),
    title: String(row.title),
    subject_id: String(row.subject_id),
    created_by: String(row.created_by),
    difficulty: row.difficulty as TowerDifficulty,
    floor_count: Number(row.floor_count),
    player_limit: Number(row.player_limit),
    gcoin_reward: Number(row.gcoin_reward),
    pvp_enabled: Boolean(row.pvp_enabled),
    pvp_wager_min: Number(row.pvp_wager_min ?? 0),
    pvp_wager_max: Number(row.pvp_wager_max ?? 50),
    status: row.status as TowerStatus,
    theme: String(row.theme ?? "academy"),
    published_at: (row.published_at as string) ?? null,
    started_at: (row.started_at as string) ?? null,
    ended_at: (row.ended_at as string) ?? null,
    created_at: row.created_at as string | undefined,
    subjects: row.subjects as { name: string } | null | undefined,
  };
}

function mapPlayer(row: Record<string, unknown>): TowerPlayer {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    user_id: String(row.user_id),
    display_name: String(row.display_name),
    gotchi_name: String(row.gotchi_name),
    voxels: Array.isArray(row.voxels) ? (row.voxels as Voxel[]) : [],
    floor: Number(row.floor),
    xp: Number(row.xp),
    level: Number(row.level),
    knowledge: Number(row.knowledge),
    resolve: Number(row.resolve),
    agility: Number(row.agility),
    insight: Number(row.insight),
    spirit: Number(row.spirit),
    harmony: Number(row.harmony),
    hp: Number(row.hp),
    max_hp: Number(row.max_hp),
    energy: Number(row.energy),
    max_energy: Number(row.max_energy),
    gcoins_earned: Number(row.gcoins_earned),
    correct_answers: Number(row.correct_answers),
    wrong_answers: Number(row.wrong_answers),
    battles_won: Number(row.battles_won),
    battles_lost: Number(row.battles_lost),
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    companions: Array.isArray(row.companions) ? (row.companions as CompanionInstance[]) : [],
    equipment: (row.equipment as Record<string, unknown>) ?? {},
    titles: Array.isArray(row.titles) ? (row.titles as string[]) : [],
    online: Boolean(row.online),
    pos_x: Number(row.pos_x ?? 400),
    pos_y: Number(row.pos_y ?? 300),
  };
}

function mapQuestion(row: Record<string, unknown>): TowerQuestion {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    question: String(row.question),
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correct_index: Number(row.correct_index),
    explanation: String(row.explanation ?? ""),
    hint: String(row.hint ?? ""),
    difficulty: (row.difficulty as TowerQuestion["difficulty"]) ?? "medium",
    category: String(row.category ?? "general"),
    competency: String(row.competency ?? ""),
    estimated_seconds: Number(row.estimated_seconds ?? 30),
    floor_min: Number(row.floor_min ?? 1),
    floor_max: Number(row.floor_max ?? 100),
    approved: Boolean(row.approved),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function listAdminTowerEvents(): Promise<TowerEvent[]> {
  const { data, error } = await supabase
    .from("gotchi_tower_events")
    .select("*, subjects(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapEvent(r as Record<string, unknown>));
}

export async function listStudentTowerEvents(subjectId: string): Promise<TowerEvent[]> {
  const { data, error } = await supabase
    .from("gotchi_tower_events")
    .select("*, subjects(name)")
    .eq("subject_id", subjectId)
    .in("status", ["lobby", "live"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapEvent(r as Record<string, unknown>));
}

export async function getTowerEvent(id: string): Promise<TowerEvent | null> {
  const { data, error } = await supabase
    .from("gotchi_tower_events")
    .select("*, subjects(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapEvent(data as Record<string, unknown>) : null;
}

export async function getTowerEventByCode(code: string): Promise<TowerEvent | null> {
  const { data, error } = await supabase
    .from("gotchi_tower_events")
    .select("*, subjects(name)")
    .ilike("code", code.trim())
    .maybeSingle();
  if (error) throw error;
  return data ? mapEvent(data as Record<string, unknown>) : null;
}

export async function createTowerEvent(input: {
  title: string;
  subject_id: string;
  created_by: string;
  difficulty: TowerDifficulty;
  floor_count: number;
  player_limit: number;
  gcoin_reward: number;
  pvp_enabled: boolean;
  pvp_wager_min: number;
  pvp_wager_max: number;
}): Promise<TowerEvent> {
  const { data, error } = await supabase
    .from("gotchi_tower_events")
    .insert({
      code: generateTowerCode(),
      title: input.title.trim(),
      subject_id: input.subject_id,
      created_by: input.created_by,
      difficulty: input.difficulty,
      floor_count: input.floor_count,
      player_limit: input.player_limit,
      gcoin_reward: input.gcoin_reward,
      pvp_enabled: input.pvp_enabled,
      pvp_wager_min: input.pvp_wager_min,
      pvp_wager_max: input.pvp_wager_max,
      status: "draft",
    })
    .select("*, subjects(name)")
    .single();
  if (error) throw error;
  return mapEvent(data as Record<string, unknown>);
}

export async function updateTowerEvent(
  id: string,
  patch: Partial<
    Pick<
      TowerEvent,
      | "title"
      | "difficulty"
      | "floor_count"
      | "player_limit"
      | "gcoin_reward"
      | "pvp_enabled"
      | "pvp_wager_min"
      | "pvp_wager_max"
      | "status"
      | "published_at"
      | "started_at"
      | "ended_at"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("gotchi_tower_events")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTowerEvent(id: string): Promise<void> {
  const { error } = await supabase.from("gotchi_tower_events").delete().eq("id", id);
  if (error) throw error;
}

export async function listTowerQuestions(eventId: string): Promise<TowerQuestion[]> {
  const { data, error } = await supabase
    .from("gotchi_tower_questions")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapQuestion(r as Record<string, unknown>));
}

export async function saveTowerQuestions(
  eventId: string,
  questions: Omit<TowerQuestion, "id" | "event_id">[],
): Promise<void> {
  if (!questions.length) return;
  const rows = questions.map((q, i) => ({
    event_id: eventId,
    question: q.question,
    options: q.options,
    correct_index: q.correct_index,
    explanation: q.explanation,
    hint: q.hint,
    difficulty: q.difficulty,
    category: q.category,
    competency: q.competency,
    estimated_seconds: q.estimated_seconds,
    floor_min: q.floor_min,
    floor_max: q.floor_max,
    approved: q.approved,
    sort_order: q.sort_order ?? i,
  }));
  const { error } = await supabase.from("gotchi_tower_questions").insert(rows);
  if (error) throw error;
}

export async function updateTowerQuestion(
  id: string,
  patch: Partial<TowerQuestion>,
): Promise<void> {
  const { error } = await supabase.from("gotchi_tower_questions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTowerQuestion(id: string): Promise<void> {
  const { error } = await supabase.from("gotchi_tower_questions").delete().eq("id", id);
  if (error) throw error;
}

export async function approveAllQuestions(eventId: string): Promise<void> {
  const { error } = await supabase
    .from("gotchi_tower_questions")
    .update({ approved: true })
    .eq("event_id", eventId);
  if (error) throw error;
}

const TOWER_AVATAR_STORAGE_KEY = "educhat.gotchi_tower_avatar";

function cleanRpcError(message: string | undefined, fallback: string): string {
  const msg = message || fallback;
  return msg.replace(/^.*ERROR:\s*/i, "").split("\n")[0].trim() || fallback;
}

function isMissingDbObject(message: string | undefined): boolean {
  return /does not exist|schema cache|PGRST202|PGRST205|could not find the function|gotchi_tower_avatars/i.test(
    message || "",
  );
}

function readLocalTowerAvatar(userId: string): TowerAvatar | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${TOWER_AVATAR_STORAGE_KEY}.${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string; voxels?: Voxel[] };
    if (!parsed?.name || !Array.isArray(parsed.voxels) || parsed.voxels.length < 1) return null;
    return { user_id: userId, name: parsed.name, voxels: parsed.voxels };
  } catch {
    return null;
  }
}

function writeLocalTowerAvatar(avatar: TowerAvatar): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${TOWER_AVATAR_STORAGE_KEY}.${avatar.user_id}`,
      JSON.stringify({ name: avatar.name, voxels: avatar.voxels }),
    );
  } catch {
    /* ignore quota */
  }
}

async function joinTowerClientSide(
  code: string,
  opts: { gotchiName: string; voxels: Voxel[] },
): Promise<TowerPlayer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ev = await getTowerEventByCode(code);
  if (!ev) {
    throw new Error(
      "Invalid game code, or this tower is not open for your selected subject. Check My Account → subject.",
    );
  }
  if (ev.status !== "lobby" && ev.status !== "live") {
    throw new Error(`This tower is not open for joining (status: ${ev.status})`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, selected_subject_id")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profile?.selected_subject_id &&
    ev.subject_id &&
    profile.selected_subject_id !== ev.subject_id
  ) {
    throw new Error(
      "Your selected subject does not match this tower event. Change subject in My Account.",
    );
  }

  const displayName =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) || "Scholar";
  const gotchiName = opts.gotchiName.trim().slice(0, 24);
  const voxels = opts.voxels;

  const { data: existing, error: existingErr } = await supabase
    .from("gotchi_tower_players")
    .select("*")
    .eq("event_id", ev.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingErr && !isMissingDbObject(existingErr.message)) throw existingErr;

  if (existing) {
    const { data: updated, error: updErr } = await supabase
      .from("gotchi_tower_players")
      .update({
        online: true,
        gotchi_name: gotchiName,
        voxels,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updErr) throw updErr;
    return mapPlayer(updated as Record<string, unknown>);
  }

  const { count, error: countErr } = await supabase
    .from("gotchi_tower_players")
    .select("*", { count: "exact", head: true })
    .eq("event_id", ev.id);
  // Count can 500 under recursive RLS — skip soft capacity check in that case
  if (!countErr && typeof count === "number" && count >= ev.player_limit) {
    throw new Error("Tower is full");
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("gotchi_tower_players")
    .insert({
      event_id: ev.id,
      user_id: user.id,
      display_name: displayName,
      gotchi_name: gotchiName,
      voxels,
      companions: [
        { def_id: "sparkling", level: 1, xp: 0 },
        { def_id: "leafkin", level: 1, xp: 0 },
      ],
      online: true,
    })
    .select("*")
    .single();

  if (insertErr) {
    // 409 / unique (event_id, user_id) — re-fetch own row
    if (
      insertErr.code === "23505" ||
      /duplicate|conflict|409/i.test(insertErr.message || "")
    ) {
      const { data: again, error: againErr } = await supabase
        .from("gotchi_tower_players")
        .select("*")
        .eq("event_id", ev.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (againErr) throw againErr;
      if (again) {
        await supabase
          .from("gotchi_tower_players")
          .update({
            online: true,
            gotchi_name: gotchiName,
            voxels,
            updated_at: new Date().toISOString(),
          })
          .eq("id", again.id);
        return mapPlayer({
          ...(again as Record<string, unknown>),
          gotchi_name: gotchiName,
          voxels,
          online: true,
        });
      }
    }
    throw insertErr;
  }

  return mapPlayer(inserted as Record<string, unknown>);
}

export async function joinTowerByCode(
  code: string,
  opts?: { gotchiName?: string; voxels?: Voxel[] },
): Promise<TowerPlayer> {
  const trimmedCode = code.trim();
  const gotchiName = opts?.gotchiName?.trim() || null;
  const voxels = opts?.voxels?.length ? opts.voxels : null;

  // Prefer new RPC (Tower avatar payload). Falls back for DBs that only have join(code).
  const primary = await supabase.rpc("join_gotchi_tower", {
    p_code: trimmedCode,
    p_gotchi_name: gotchiName,
    p_voxels: voxels,
  });

  if (!primary.error && primary.data) {
    return mapPlayer(primary.data as Record<string, unknown>);
  }

  const primaryMsg = primary.error?.message || "";
  if (isMissingDbObject(primaryMsg) || /function|PGRST202/i.test(primaryMsg)) {
    const legacy = await supabase.rpc("join_gotchi_tower", { p_code: trimmedCode });
    if (!legacy.error && legacy.data) {
      const row = mapPlayer(legacy.data as Record<string, unknown>);
      // Old RPC copied EdGotchi — overwrite with Tower Gotchi when we have one
      if (gotchiName && voxels?.length) {
        try {
          await updateTowerPlayer(row.id, {
            gotchi_name: gotchiName,
            voxels,
          } as Partial<TowerPlayer>);
          return { ...row, gotchi_name: gotchiName, voxels };
        } catch {
          return { ...row, gotchi_name: gotchiName, voxels };
        }
      }
      return row;
    }
  }

  // Direct insert path (works with insert-own RLS even if RPC is broken)
  if (gotchiName && voxels?.length) {
    try {
      return await joinTowerClientSide(trimmedCode, { gotchiName, voxels });
    } catch (clientErr) {
      const rpcMsg = cleanRpcError(primaryMsg, "");
      if (rpcMsg && !isMissingDbObject(rpcMsg)) {
        throw new Error(rpcMsg);
      }
      throw clientErr instanceof Error
        ? clientErr
        : new Error(cleanRpcError(primaryMsg, "Could not join"));
    }
  }

  throw new Error(
    cleanRpcError(primaryMsg, "Could not join") ||
      "Create your Gotchi Tower avatar first, then try the code again.",
  );
}

export async function loadTowerAvatar(userId: string): Promise<TowerAvatar | null> {
  const { data, error } = await supabase
    .from("gotchi_tower_avatars")
    .select("user_id, name, voxels")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingDbObject(error.message)) {
      return readLocalTowerAvatar(userId);
    }
    throw error;
  }
  if (!data) return readLocalTowerAvatar(userId);
  const avatar = {
    user_id: String(data.user_id),
    name: String(data.name),
    voxels: Array.isArray(data.voxels) ? (data.voxels as Voxel[]) : [],
  };
  writeLocalTowerAvatar(avatar);
  return avatar;
}

export async function saveTowerAvatar(
  userId: string,
  name: string,
  voxels: Voxel[],
): Promise<TowerAvatar> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Name must be at least 2 characters");
  if (voxels.length < 4) throw new Error("Paint at least a few cubes for your Gotchi");

  const avatar: TowerAvatar = {
    user_id: userId,
    name: trimmed.slice(0, 24),
    voxels,
  };

  const { data, error } = await supabase
    .from("gotchi_tower_avatars")
    .upsert(
      {
        user_id: userId,
        name: avatar.name,
        voxels,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id, name, voxels")
    .single();

  if (error) {
    // Table missing until FIX migration — keep Tower Gotchi locally (never touch edgotchis)
    if (isMissingDbObject(error.message)) {
      writeLocalTowerAvatar(avatar);
      return avatar;
    }
    throw error;
  }

  const saved = {
    user_id: String(data.user_id),
    name: String(data.name),
    voxels: Array.isArray(data.voxels) ? (data.voxels as Voxel[]) : [],
  };
  writeLocalTowerAvatar(saved);
  return saved;
}

export async function listEventPlayers(eventId: string): Promise<TowerPlayer[]> {
  // Prefer security-definer RPC (avoids recursive RLS 500 on older policies)
  const rpc = await supabase.rpc("list_gotchi_tower_players", { p_event_id: eventId });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return rpc.data.map((r) => mapPlayer(r as Record<string, unknown>));
  }

  const { data, error } = await supabase
    .from("gotchi_tower_players")
    .select("*")
    .eq("event_id", eventId)
    .order("floor", { ascending: false });

  if (error) {
    // Recursive RLS often surfaces as 500 / infinite recursion
    if (/500|recursion|infinite/i.test(error.message) || error.code === "42P17") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw error;
      const own = await supabase
        .from("gotchi_tower_players")
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", user.id);
      if (own.error) throw error;
      return (own.data ?? []).map((r) => mapPlayer(r as Record<string, unknown>));
    }
    throw error;
  }
  return (data ?? []).map((r) => mapPlayer(r as Record<string, unknown>));
}

export async function updateTowerPlayer(
  id: string,
  patch: Partial<TowerPlayer>,
): Promise<void> {
  const { error } = await supabase
    .from("gotchi_tower_players")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function loadApprovedQuestionsForFloor(
  eventId: string,
  floor: number,
  limit = 12,
): Promise<TowerQuestion[]> {
  const { data, error } = await supabase
    .from("gotchi_tower_questions")
    .select("*")
    .eq("event_id", eventId)
    .eq("approved", true)
    .lte("floor_min", floor)
    .gte("floor_max", floor)
    .limit(limit);
  if (error) throw error;
  let rows = (data ?? []).map((r) => mapQuestion(r as Record<string, unknown>));
  if (rows.length < 3) {
    const { data: fallback } = await supabase
      .from("gotchi_tower_questions")
      .select("*")
      .eq("event_id", eventId)
      .eq("approved", true)
      .limit(limit);
    rows = (fallback ?? []).map((r) => mapQuestion(r as Record<string, unknown>));
  }
  return rows;
}

export async function fetchEventStats(eventId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("gotchi_tower_event_stats", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return (data as Record<string, number>) ?? {};
}

export async function listCompanionDefs(): Promise<CompanionDef[]> {
  const { data, error } = await supabase.from("gotchi_tower_companion_defs").select("*");
  if (error) throw error;
  return (data ?? []) as CompanionDef[];
}

/** Generate tower questions via Gemini (richer schema than reviewers). */
export async function generateTowerQuestions(input: {
  topic: string;
  notes?: string;
  count?: number;
  difficulty?: TowerDifficulty;
  floorCount?: number;
}): Promise<TowerQuestion[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/ai/generate-tower-questions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic: input.topic,
      notes: input.notes ?? "",
      count: input.count ?? 10,
      difficulty: input.difficulty ?? "mixed",
      floorCount: input.floorCount ?? 20,
    }),
  });

  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    questions?: TowerQuestion[];
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Generate failed (${res.status})`);
  }
  return (json.questions ?? []).map((q, i) => ({
    question: q.question,
    options: q.options,
    correct_index: q.correct_index,
    explanation: q.explanation ?? "",
    hint: q.hint ?? "",
    difficulty: q.difficulty ?? "medium",
    category: q.category ?? "general",
    competency: q.competency ?? "",
    estimated_seconds: q.estimated_seconds ?? 30,
    floor_min: q.floor_min ?? 1,
    floor_max: q.floor_max ?? input.floorCount ?? 20,
    approved: false,
    sort_order: i,
  }));
}

export type MultiplayerMessage =
  | { type: "hello"; userId: string; name: string; floor: number; x: number; y: number; voxels: Voxel[] }
  | { type: "move"; userId: string; x: number; y: number; floor: number }
  | { type: "chat"; userId: string; name: string; text: string }
  | { type: "challenge"; from: string; to: string; wager: number }
  | { type: "challenge_response"; from: string; to: string; accept: boolean; wager: number }
  | { type: "battle_action"; battleId: string; userId: string; action: string; answerIndex?: number }
  | { type: "presence"; players: Array<{ userId: string; name: string; floor: number; x: number; y: number }> }
  | { type: "battle_state"; battle: Record<string, unknown> }
  | { type: "floor_event"; event: string; payload?: unknown }
  | { type: "error"; message: string };

export function towerWsUrl(eventId: string, token: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/gotchi-tower/ws?event=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`;
}
