import escapeLibrary from "@/assets/escape-library.jpg";
import escapeLab from "@/assets/escape-lab.jpg";
import escapeVault from "@/assets/escape-vault.jpg";
import escapeObservatory from "@/assets/escape-observatory.jpg";
import escapeSpaceship from "@/assets/escape-spaceship.jpg";
import escapePyramid from "@/assets/escape-pyramid.jpg";
import escapeAquarium from "@/assets/escape-aquarium.jpg";

export const ESCAPE_MAX_SCORE = 30;

export type EscapeScene =
  | "library"
  | "lab"
  | "vault"
  | "observatory"
  | "spaceship"
  | "pyramid"
  | "aquarium";

export const ESCAPE_SCENES: { key: EscapeScene; label: string; image: string }[] = [
  { key: "library", label: "Ancient Library", image: escapeLibrary },
  { key: "lab", label: "Science Lab", image: escapeLab },
  { key: "vault", label: "Temple Vault", image: escapeVault },
  { key: "observatory", label: "Star Observatory", image: escapeObservatory },
  { key: "spaceship", label: "Starship Deck", image: escapeSpaceship },
  { key: "pyramid", label: "Pyramid Tomb", image: escapePyramid },
  { key: "aquarium", label: "Deep-Sea Station", image: escapeAquarium },
];

export function sceneImage(scene?: string | null) {
  return (ESCAPE_SCENES.find((s) => s.key === scene) ?? ESCAPE_SCENES[0]!).image;
}

export function sceneLabel(scene?: string | null) {
  return (ESCAPE_SCENES.find((s) => s.key === scene) ?? ESCAPE_SCENES[0]!).label;
}

export interface EscapePuzzle {
  id: string;
  scene: EscapeScene;
  /** Room name shown as the lock title */
  title: string;
  /** Story text that sets the scene */
  story: string;
  question: string;
  answer: string;
  hint: string;
  /** Optional custom image URL (overrides the scene art) */
  image_url?: string | null;
}

export interface EscapeConfig {
  intro: string;
  /** Target time in seconds for a perfect 30 */
  par_seconds: number;
  puzzles: EscapePuzzle[];
}

export const DEFAULT_ESCAPE_CONFIG: EscapeConfig = {
  intro: "The door locked behind you. Solve every puzzle to escape before time runs out!",
  par_seconds: 600,
  puzzles: [],
};

export function normalizeAnswer(v: string) {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCorrect(given: string, expected: string) {
  const g = normalizeAnswer(given);
  if (!g) return false;
  // expected may hold several accepted answers separated by |
  return expected
    .split("|")
    .map(normalizeAnswer)
    .filter(Boolean)
    .some((e) => e === g);
}

/** First accepted answer, used by the reveal-letters powerup. */
export function primaryAnswer(expected: string) {
  return (expected.split("|")[0] ?? "").trim();
}

export interface EscapeScoreInput {
  seconds: number;
  parSeconds: number;
  hintsUsed: number;
  wrongAnswers: number;
  /** Locks opened with a skeleton key (−3 each) */
  keysUsed?: number;
  /** Bonus points from powerups (lucky charm) */
  bonus?: number;
}

/**
 * 30 points when finished within par time, decaying with extra time.
 * −2 per hint, −0.5 per wrong answer, −3 per skeleton key, + powerup bonus.
 * Never below 5 for a finished room, never above 30.
 */
export function scoreEscapeRun({
  seconds,
  parSeconds,
  hintsUsed,
  wrongAnswers,
  keysUsed = 0,
  bonus = 0,
}: EscapeScoreInput): number {
  const par = Math.max(30, parSeconds || 600);
  const timeScore =
    seconds <= par ? ESCAPE_MAX_SCORE : Math.max(12, (ESCAPE_MAX_SCORE * par) / seconds);
  const raw = timeScore - hintsUsed * 2 - wrongAnswers * 0.5 - keysUsed * 3 + bonus;
  return Math.max(5, Math.min(ESCAPE_MAX_SCORE, Math.round(raw * 2) / 2));
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
