import { supabase } from "@/integrations/supabase/client";
import type { EscapeConfig, EscapePuzzle, EscapeScene } from "@/lib/escape-room";
import { ESCAPE_SCENES } from "@/lib/escape-room";

const SCENE_KEYS = new Set(ESCAPE_SCENES.map((s) => s.key));

function asScene(raw: string, index: number): EscapeScene {
  const key = raw.trim().toLowerCase();
  if (SCENE_KEYS.has(key as EscapeScene)) return key as EscapeScene;
  return ESCAPE_SCENES[index % ESCAPE_SCENES.length]!.key;
}

/** Generate a full EscapeConfig from a curriculum topic via Gemini. */
export async function generateEscapeConfigFromTopic(input: {
  topic: string;
  notes?: string;
  template_id?: string;
  template_name?: string;
  puzzle_count?: number;
  minutes?: number;
  difficulty?: string;
}): Promise<EscapeConfig> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/ai/generate-escape-room", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic: input.topic,
      notes: input.notes ?? "",
      template_id: input.template_id ?? "",
      template_name: input.template_name ?? "",
      puzzle_count: input.puzzle_count ?? 5,
      minutes: input.minutes ?? 15,
      difficulty: input.difficulty ?? "mixed",
    }),
  });

  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    intro?: string;
    par_seconds?: number;
    puzzles?: Array<{
      scene?: string;
      title?: string;
      story?: string;
      question?: string;
      answer?: string;
      hint?: string;
    }>;
  };

  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Generate failed (${res.status})`);
  }

  const puzzles: EscapePuzzle[] = (json.puzzles ?? []).map((p, i) => ({
    id: crypto.randomUUID(),
    scene: asScene(String(p.scene ?? ""), i),
    title: String(p.title ?? `Lock ${i + 1}`).trim() || `Lock ${i + 1}`,
    story: String(p.story ?? "").trim(),
    question: String(p.question ?? "").trim(),
    answer: String(p.answer ?? "").trim(),
    hint: String(p.hint ?? "").trim(),
    image_url: "",
  }));

  if (puzzles.length < 3) {
    throw new Error("AI returned too few puzzles — try again");
  }

  return {
    intro:
      String(json.intro ?? "").trim() ||
      "The door locked behind you. Solve every puzzle to escape before time runs out!",
    par_seconds: Math.max(60, Math.min(3600, Number(json.par_seconds) || 600)),
    puzzles,
  };
}
