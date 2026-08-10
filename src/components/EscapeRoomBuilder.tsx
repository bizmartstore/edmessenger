import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  ESCAPE_SCENES,
  type EscapeConfig,
  type EscapePuzzle,
  type EscapeScene,
} from "@/lib/escape-room";
import { generateEscapeConfigFromTopic } from "@/lib/escape-room-ai";
import {
  DIFFICULTY_META,
  ESCAPE_TEMPLATES,
  templateToConfig,
} from "@/lib/escape-templates";


function newPuzzle(): EscapePuzzle {
  return {
    id: crypto.randomUUID(),
    scene: "library",
    title: "",
    story: "",
    question: "",
    answer: "",
    hint: "",
    image_url: "",
  };
}

export function EscapeRoomBuilder({
  value,
  onChange,
}: {
  value: EscapeConfig;
  onChange: (next: EscapeConfig) => void;
}) {
  const [aiTopic, setAiTopic] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [aiTemplateId, setAiTemplateId] = useState(ESCAPE_TEMPLATES[0]?.id ?? "");
  const [aiCount, setAiCount] = useState(5);
  const [generating, setGenerating] = useState(false);

  function update(patch: Partial<EscapeConfig>) {
    onChange({ ...value, ...patch });
  }

  function updatePuzzle(id: string, patch: Partial<EscapePuzzle>) {
    update({ puzzles: value.puzzles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  async function runAiGenerate() {
    if (generating) return;
    const topic = aiTopic.trim();
    if (!topic) {
      toast.error("Enter a topic / lesson outline to generate from");
      return;
    }
    const tpl = ESCAPE_TEMPLATES.find((t) => t.id === aiTemplateId);
    setGenerating(true);
    try {
      const config = await generateEscapeConfigFromTopic({
        topic,
        notes: aiNotes,
        template_id: tpl?.id,
        template_name: tpl?.name,
        puzzle_count: aiCount || tpl?.puzzles.length || 5,
        minutes: tpl?.minutes ?? 15,
        difficulty: tpl?.difficulty ?? "mixed",
      });
      onChange(config);
      toast.success(`Generated ${config.puzzles.length} locks from your topic — review before saving`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generate failed");
    } finally {
      setGenerating(false);
    }
  }

  const input =
    "w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm focus:border-primary";

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Escape room setup
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <Wand2 className="h-3.5 w-3.5" /> Generate from topic (AI)
        </div>
        <p className="text-[10px] text-muted-foreground">
          Paste your lesson outline. AI fills a complete escape room using a built-in template style
          (quiz, scenario, cipher-style locks, etc.).
        </p>
        <textarea
          value={aiTopic}
          onChange={(e) => setAiTopic(e.target.value)}
          rows={5}
          placeholder={`Example:
Establishing Healthy Relationships
A. Personal Growth and Group Productivity
B. Mental Health and Well-Being
C. Conflict Management

Applying Interpersonal Effectiveness at Home, School, and Community...`}
          className={input}
        />
        <textarea
          value={aiNotes}
          onChange={(e) => setAiNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes (focus areas, reading level, avoid topics…)"
          className={input}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-[11px] font-semibold text-muted-foreground">
            Template style
            <select
              value={aiTemplateId}
              onChange={(e) => {
                setAiTemplateId(e.target.value);
                const t = ESCAPE_TEMPLATES.find((x) => x.id === e.target.value);
                if (t) setAiCount(t.puzzles.length);
              }}
              className={input}
            >
              {ESCAPE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.puzzles.length} locks)
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-[11px] font-semibold text-muted-foreground">
            Lock count
            <input
              type="number"
              min={3}
              max={10}
              value={aiCount}
              onChange={(e) => setAiCount(Number(e.target.value))}
              className={input}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={generating}
          onClick={() => void runAiGenerate()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl gradient-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating escape room…
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5" /> Generate complete escape from topic
            </>
          )}
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-muted-foreground">
          Or start from a built-in template
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ESCAPE_TEMPLATES.map((t) => {
            const meta = DIFFICULTY_META[t.difficulty];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(templateToConfig(t))}
                className="text-left rounded-xl border border-border bg-card p-3 hover:border-primary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-bold truncate">{t.name}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">{t.tagline}</div>
                <div className="mt-1 text-[10px] font-semibold text-muted-foreground">
                  {t.puzzles.length} locks · {t.minutes} min target
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Picking a template or generating with AI replaces the current setup — then edit any
          question, answer or hint.
        </p>
      </div>

      <textarea
        value={value.intro}

        onChange={(e) => update({ intro: e.target.value })}
        rows={2}
        placeholder="Intro story shown before students enter"
        className={input}
      />

      <label className="block text-[11px] font-semibold text-muted-foreground">
        Target time for a perfect 30 (minutes)
        <input
          type="number"
          min={1}
          value={Math.max(1, Math.round((value.par_seconds || 600) / 60))}
          onChange={(e) => update({ par_seconds: Math.max(60, Number(e.target.value) * 60 || 600) })}
          className={`${input} mt-1`}
        />
      </label>

      <div className="space-y-3">
        {value.puzzles.map((p, i) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold">Lock {i + 1}</div>
              <button
                type="button"
                onClick={() => update({ puzzles: value.puzzles.filter((x) => x.id !== p.id) })}
                className="p-1.5 rounded-lg hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
            <input
              value={p.title}
              onChange={(e) => updatePuzzle(p.id, { title: e.target.value })}
              placeholder="Room / lock name (e.g. The Dusty Archive)"
              className={input}
            />
            <select
              value={p.scene}
              onChange={(e) => updatePuzzle(p.id, { scene: e.target.value as EscapeScene })}
              className={input}
            >
              {ESCAPE_SCENES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              value={p.image_url ?? ""}
              onChange={(e) => updatePuzzle(p.id, { image_url: e.target.value })}
              placeholder="Custom image URL (optional)"
              className={input}
            />
            <textarea
              value={p.story}
              onChange={(e) => updatePuzzle(p.id, { story: e.target.value })}
              rows={2}
              placeholder="Scene story / clue text"
              className={input}
            />
            <textarea
              value={p.question}
              onChange={(e) => updatePuzzle(p.id, { question: e.target.value })}
              rows={2}
              placeholder="Question students must answer"
              className={input}
            />
            <input
              value={p.answer}
              onChange={(e) => updatePuzzle(p.id, { answer: e.target.value })}
              placeholder="Answer (use | for alternatives, e.g. 42|forty two)"
              className={input}
            />
            <input
              value={p.hint}
              onChange={(e) => updatePuzzle(p.id, { hint: e.target.value })}
              placeholder="Hint (costs the student 2 points)"
              className={input}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => update({ puzzles: [...value.puzzles, newPuzzle()] })}
        className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-semibold"
      >
        <Plus className="h-3.5 w-3.5" /> Add lock / puzzle
      </button>

      <p className="text-[10px] text-muted-foreground">
        Scoring is automatic: 30 points when finished within the target time, less for slower
        escapes, −2 per hint and −0.5 per wrong try (never below 5).
      </p>
    </div>
  );
}
