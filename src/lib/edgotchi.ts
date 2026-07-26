import { supabase } from "@/integrations/supabase/client";

/** Compact voxel: x,y on 8×10 grid, c = palette index 0–7 */
export type Voxel = { x: number; y: number; c: number };

export type EdgotchiRow = {
  user_id: string;
  name: string;
  voxels: Voxel[];
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  mana: number;
  max_mana: number;
  wins: number;
  battles: number;
  skills: string[];
  map_id: string;
  /** Soft currency earned by defeating wild Gotchis. */
  gotchi_tokens: number;
  created_at?: string;
  updated_at?: string;
};

/** Snapshot of a wild Gotchi spawned in the open world (client-only, no DB). */
export type WildGotchi = {
  id: string;
  name: string;
  voxels: Voxel[];
  level: number;
  maxHp: number;
  hp: number;
  power: number;
  tokenReward: number;
};

export type MapTheme = {
  id: string;
  name: string;
  tint: number;
  groundA: number;
  groundB: number;
  path: number;
  accent: number;
  treeColor: number;
  leafColor: number;
  skyDay: number;
  skyNight: number;
  worldW: number;
  worldH: number;
  wildCount: number;
  treeCount: number;
  grassCount: number;
};

export const VOXEL_COLS = 8;
export const VOXEL_ROWS = 10;
export const MAX_VOXELS = 64;

export const PALETTE = [
  "#7c3aed",
  "#2563eb",
  "#059669",
  "#d97706",
  "#e11d48",
  "#0f172a",
  "#f8fafc",
  "#fbbf24",
] as const;

export type SkillId = "spark" | "heal" | "blast" | "shield" | "nova";

export type SkillDef = {
  id: SkillId;
  name: string;
  unlockLevel: number;
  mana: number;
  /** Positive = damage, negative = heal self */
  power: number;
  color: number;
  description: string;
};

export const SKILLS: Record<SkillId, SkillDef> = {
  spark: {
    id: "spark",
    name: "Spark Bolt",
    unlockLevel: 1,
    mana: 0,
    power: 18,
    color: 0xffdd44,
    description: "A quick knowledge spark. Free!",
  },
  heal: {
    id: "heal",
    name: "Heal Pulse",
    unlockLevel: 3,
    mana: 15,
    power: -28,
    color: 0x44ff88,
    description: "Restore HP with calm focus.",
  },
  blast: {
    id: "blast",
    name: "Quiz Blast",
    unlockLevel: 5,
    mana: 22,
    power: 42,
    color: 0xff44aa,
    description: "Heavy quiz energy strike.",
  },
  shield: {
    id: "shield",
    name: "Focus Shield",
    unlockLevel: 7,
    mana: 18,
    power: 0,
    color: 0x44aaff,
    description: "Halve the next enemy hit.",
  },
  nova: {
    id: "nova",
    name: "Knowledge Nova",
    unlockLevel: 10,
    mana: 35,
    power: 70,
    color: 0xffffff,
    description: "Ultimate burst of learning power.",
  },
};

export const MAPS: readonly MapTheme[] = [
  {
    id: "campus",
    name: "Campus Courtyard",
    tint: 0x1e3a5f,
    groundA: 0x3d7a45,
    groundB: 0x2f6238,
    path: 0xc4b08a,
    accent: 0x6bbf6f,
    treeColor: 0x5c3a1e,
    leafColor: 0x2f8f3a,
    skyDay: 0x87b8e8,
    skyNight: 0x0b1530,
    worldW: 3600,
    worldH: 2800,
    wildCount: 220,
    treeCount: 90,
    grassCount: 280,
  },
  {
    id: "library",
    name: "Silent Library",
    tint: 0x2d1b4e,
    groundA: 0x3a2a55,
    groundB: 0x2a1c42,
    path: 0x6b5a48,
    accent: 0x8b6bbf,
    treeColor: 0x4a3428,
    leafColor: 0x5a3d7a,
    skyDay: 0x6a5a8a,
    skyNight: 0x10081f,
    worldW: 3400,
    worldH: 2600,
    wildCount: 200,
    treeCount: 70,
    grassCount: 160,
  },
  {
    id: "lab",
    name: "Science Lab",
    tint: 0x0f3d3e,
    groundA: 0x1a5550,
    groundB: 0x134040,
    path: 0x5a7a78,
    accent: 0x3ecfc0,
    treeColor: 0x2a4a48,
    leafColor: 0x2aa88a,
    skyDay: 0x5aa8b0,
    skyNight: 0x061820,
    worldW: 3500,
    worldH: 2700,
    wildCount: 210,
    treeCount: 55,
    grassCount: 200,
  },
  {
    id: "arena",
    name: "Quiz Arena",
    tint: 0x4a1c2f,
    groundA: 0x8a5a3a,
    groundB: 0x6e452c,
    path: 0xb89a6a,
    accent: 0xe07050,
    treeColor: 0x5a3020,
    leafColor: 0x8a6030,
    skyDay: 0xe0a060,
    skyNight: 0x1a0810,
    worldW: 3800,
    worldH: 3000,
    wildCount: 240,
    treeCount: 40,
    grassCount: 220,
  },
] as const;

export function getMap(mapId: string): MapTheme {
  return MAPS.find((m) => m.id === mapId) ?? MAPS[0];
}

/** Tiny seeded RNG — deterministic wild layouts per map, no network. */
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const WILD_PREFIX = ["Zap", "Nova", "Byte", "Quiz", "Pixel", "Spark", "Echo", "Flux", "Luma", "Hex"];
const WILD_SUFFIX = ["ling", "bit", "chi", "orb", "kit", "pup", "fox", "owl", "ray", "bug"];

/** Procedural voxel pet — hundreds of unique looks, zero asset quota. */
export function generateWildVoxels(seed: number): Voxel[] {
  const rnd = mulberry32(seed);
  const cells: Voxel[] = [];
  const bodyC = Math.floor(rnd() * 8);
  const accentC = Math.floor(rnd() * 8);
  const eyeC = 6;
  const width = 3 + Math.floor(rnd() * 3);
  const height = 4 + Math.floor(rnd() * 4);
  const ox = Math.floor((VOXEL_COLS - width) / 2);
  const oy = Math.floor((VOXEL_ROWS - height) / 2) + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rnd() < 0.18) continue;
      cells.push({ x: ox + x, y: oy + y, c: rnd() < 0.2 ? accentC : bodyC });
    }
  }
  // Eyes
  if (width >= 3) {
    cells.push({ x: ox + 1, y: oy + 1, c: eyeC });
    cells.push({ x: ox + width - 2, y: oy + 1, c: eyeC });
  }
  // Legs / antennae
  if (rnd() > 0.35) {
    cells.push({ x: ox, y: oy + height, c: bodyC });
    cells.push({ x: ox + width - 1, y: oy + height, c: bodyC });
  }
  if (rnd() > 0.5) {
    cells.push({ x: ox + Math.floor(width / 2), y: oy - 1, c: accentC });
  }
  // Deduplicate by cell
  const seen = new Set<string>();
  const out: Voxel[] = [];
  for (const v of cells) {
    if (v.x < 0 || v.x >= VOXEL_COLS || v.y < 0 || v.y >= VOXEL_ROWS) continue;
    const k = `${v.x},${v.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= MAX_VOXELS) break;
  }
  return out.length >= 4 ? out : [{ x: 3, y: 4, c: bodyC }, { x: 4, y: 4, c: bodyC }, { x: 3, y: 5, c: accentC }, { x: 4, y: 5, c: accentC }];
}

export function wildGotchiName(seed: number): string {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const a = WILD_PREFIX[Math.floor(rnd() * WILD_PREFIX.length)];
  const b = WILD_SUFFIX[Math.floor(rnd() * WILD_SUFFIX.length)];
  return `${a}${b}`;
}

export function tokenRewardForLevel(level: number): number {
  return 4 + Math.floor(level * 1.5) + Math.floor(Math.random() * 4);
}

export function spawnWildGotchi(mapId: string, index: number, playerLevel: number): WildGotchi {
  const seed = (mapId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 9973 + index * 7919) >>> 0;
  const rnd = mulberry32(seed);
  const level = Math.max(1, playerLevel + Math.floor(rnd() * 5) - 1);
  const maxHp = 55 + level * 9 + Math.floor(rnd() * 20);
  return {
    id: `${mapId}-w${index}`,
    name: wildGotchiName(seed),
    voxels: generateWildVoxels(seed),
    level,
    maxHp,
    hp: maxHp,
    power: 8 + level * 2 + Math.floor(rnd() * 4),
    tokenReward: tokenRewardForLevel(level),
  };
}

export function xpToNext(level: number) {
  return 40 + level * 25;
}

export function skillsForLevel(level: number): SkillId[] {
  return (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].unlockLevel <= level);
}

export function applyLevelUps(pet: EdgotchiRow): EdgotchiRow {
  let { level, xp, max_hp, max_mana, hp, mana, skills } = pet;
  let guard = 0;
  while (xp >= xpToNext(level) && level < 99 && guard < 20) {
    xp -= xpToNext(level);
    level += 1;
    max_hp += 12;
    max_mana += 6;
    hp = max_hp;
    mana = max_mana;
    skills = skillsForLevel(level);
    guard += 1;
  }
  return { ...pet, level, xp, max_hp, max_mana, hp, mana, skills };
}

function normalizeVoxels(raw: unknown): Voxel[] {
  if (!Array.isArray(raw)) return [];
  const out: Voxel[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const x = Number(o.x);
    const y = Number(o.y);
    const c = Number(o.c);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(c)) continue;
    if (x < 0 || x >= VOXEL_COLS || y < 0 || y >= VOXEL_ROWS) continue;
    out.push({ x: Math.floor(x), y: Math.floor(y), c: Math.max(0, Math.min(7, Math.floor(c))) });
    if (out.length >= MAX_VOXELS) break;
  }
  return out;
}

function rowFromDb(data: Record<string, unknown>): EdgotchiRow {
  return {
    user_id: String(data.user_id),
    name: String(data.name),
    voxels: normalizeVoxels(data.voxels),
    level: Number(data.level) || 1,
    xp: Number(data.xp) || 0,
    hp: Number(data.hp) || 100,
    max_hp: Number(data.max_hp) || 100,
    mana: Number(data.mana) || 50,
    max_mana: Number(data.max_mana) || 50,
    wins: Number(data.wins) || 0,
    battles: Number(data.battles) || 0,
    skills: Array.isArray(data.skills) ? (data.skills as string[]) : ["spark"],
    map_id: String(data.map_id || "campus"),
    gotchi_tokens: Math.max(0, Math.floor(Number(data.gotchi_tokens) || 0)),
    created_at: data.created_at ? String(data.created_at) : undefined,
    updated_at: data.updated_at ? String(data.updated_at) : undefined,
  };
}

/** Single read — no polling. */
export async function loadEdgotchi(userId: string): Promise<EdgotchiRow | null> {
  const { data, error } = await supabase.from("edgotchis").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowFromDb(data as Record<string, unknown>);
}

/** Create once — permanent. */
export async function createEdgotchi(userId: string, name: string, voxels: Voxel[]): Promise<EdgotchiRow> {
  const trimmed = name.trim().slice(0, 24);
  if (trimmed.length < 2) throw new Error("Name must be at least 2 characters");
  const compact = normalizeVoxels(voxels);
  if (compact.length < 4) throw new Error("Draw at least 4 cubes for your Edgotchi");
  const payload = {
    user_id: userId,
    name: trimmed,
    voxels: compact,
    level: 1,
    xp: 0,
    hp: 100,
    max_hp: 100,
    mana: 50,
    max_mana: 50,
    wins: 0,
    battles: 0,
    skills: ["spark"],
    map_id: "campus",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("edgotchis").insert(payload).select("*").single();
  if (error) throw error;
  return rowFromDb(data as Record<string, unknown>);
}

/** Battle/map save — one upsert-sized update, no realtime fanout. */
export async function saveEdgotchiProgress(pet: EdgotchiRow): Promise<EdgotchiRow> {
  const leveled = applyLevelUps({
    ...pet,
    updated_at: new Date().toISOString(),
  });
  const next = {
    ...leveled,
    skills: skillsForLevel(leveled.level),
  };
  const { data, error } = await supabase
    .from("edgotchis")
    .update({
      level: next.level,
      xp: next.xp,
      hp: Math.min(next.hp, next.max_hp),
      max_hp: next.max_hp,
      mana: Math.min(next.mana, next.max_mana),
      max_mana: next.max_mana,
      wins: next.wins,
      battles: next.battles,
      skills: next.skills,
      map_id: next.map_id,
      gotchi_tokens: Math.max(0, Math.floor(next.gotchi_tokens || 0)),
      updated_at: next.updated_at,
    })
    .eq("user_id", next.user_id)
    .select("*")
    .single();
  if (error) {
    // Graceful if migration not applied yet — retry without tokens column.
    if (String(error.message || "").toLowerCase().includes("gotchi_tokens")) {
      const { data: d2, error: e2 } = await supabase
        .from("edgotchis")
        .update({
          level: next.level,
          xp: next.xp,
          hp: Math.min(next.hp, next.max_hp),
          max_hp: next.max_hp,
          mana: Math.min(next.mana, next.max_mana),
          max_mana: next.max_mana,
          wins: next.wins,
          battles: next.battles,
          skills: next.skills,
          map_id: next.map_id,
          updated_at: next.updated_at,
        })
        .eq("user_id", next.user_id)
        .select("*")
        .single();
      if (e2) throw e2;
      const row = rowFromDb(d2 as Record<string, unknown>);
      return { ...row, gotchi_tokens: next.gotchi_tokens || 0 };
    }
    throw error;
  }
  return rowFromDb(data as Record<string, unknown>);
}

export type QuizQ = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
};

const FALLBACK: QuizQ[] = [
  {
    id: "fb1",
    question: "What is 7 × 8?",
    options: ["54", "56", "64", "48"],
    correct_index: 1,
  },
  {
    id: "fb2",
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"],
    correct_index: 1,
  },
  {
    id: "fb3",
    question: "Water's chemical formula is…",
    options: ["CO2", "H2O", "O2", "NaCl"],
    correct_index: 1,
  },
  {
    id: "fb4",
    question: "The capital of France is…",
    options: ["Lyon", "Marseille", "Paris", "Nice"],
    correct_index: 2,
  },
  {
    id: "fb5",
    question: "Photosynthesis mainly happens in the…",
    options: ["Roots", "Leaves", "Flowers", "Bark"],
    correct_index: 1,
  },
];

function parseOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** Pull a small batch from published reviewers; falls back locally. Quota: 1 query, limit 24. */
export async function loadBattleQuestions(limit = 8): Promise<QuizQ[]> {
  try {
    const { data: reviewers } = await supabase
      .from("reviewers")
      .select("id")
      .eq("published", true)
      .limit(12);
    const ids = (reviewers ?? []).map((r) => r.id as string);
    if (!ids.length) return shuffle(FALLBACK).slice(0, limit);

    const { data: qs } = await supabase
      .from("reviewer_questions")
      .select("id, question, options, correct_index")
      .in("reviewer_id", ids)
      .limit(24);

    const mapped: QuizQ[] = [];
    for (const q of qs ?? []) {
      const options = parseOptions(q.options);
      if (options.length < 2) continue;
      const ci = Number(q.correct_index);
      if (!Number.isFinite(ci) || ci < 0 || ci >= options.length) continue;
      mapped.push({
        id: String(q.id),
        question: String(q.question),
        options,
        correct_index: ci,
      });
    }
    if (mapped.length < 3) return shuffle(FALLBACK).slice(0, limit);
    return shuffle(mapped).slice(0, limit);
  } catch {
    return shuffle(FALLBACK).slice(0, limit);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function enemyForMap(mapId: string, playerLevel: number) {
  const base = 70 + playerLevel * 8;
  const names: Record<string, string> = {
    campus: "Rogue Notebook",
    library: "Silent Specter",
    lab: "Beaker Beast",
    arena: "Quiz Titan",
  };
  return {
    name: names[mapId] ?? "Wild Edgotchi",
    maxHp: base,
    hp: base,
    power: 10 + playerLevel * 2,
    voxels: generateWildVoxels((mapId.length * 1337 + playerLevel * 99) >>> 0),
    tokenReward: tokenRewardForLevel(playerLevel),
  };
}
