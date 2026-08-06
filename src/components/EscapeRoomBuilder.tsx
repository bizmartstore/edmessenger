import { Plus, Trash2 } from "lucide-react";
import {
  ESCAPE_SCENES,
  type EscapeConfig,
  type EscapePuzzle,
  type EscapeScene,
} from "@/lib/escape-room";

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
  function update(patch: Partial<EscapeConfig>) {
    onChange({ ...value, ...patch });
  }

  function updatePuzzle(id: string, patch: Partial<EscapePuzzle>) {
    update({ puzzles: value.puzzles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  const input =
    "w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm focus:border-primary";

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Escape room setup
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
