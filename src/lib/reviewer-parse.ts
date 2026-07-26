/** Parse pasted quiz/reviewer text into structured questions. */

export interface ParsedReviewerQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

const LETTER_TO_INDEX: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
};

function cleanLine(line: string): string {
  return line.replace(/\r/g, "").trim();
}

function stripOptionPrefix(line: string): string {
  return line
    .replace(/^\(?[A-Fa-f1-6]\)?[.)]\s*/, "")
    .replace(/^[A-Fa-f1-6][)\]]\s*/, "")
    .replace(/^[-•*]\s*/, "")
    .trim();
}

function parseAnswerToken(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
  if (!t) return null;
  if (t in LETTER_TO_INDEX) return LETTER_TO_INDEX[t];
  const n = Number(t);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return n - 1;
  return null;
}

/**
 * Supports common paste formats, e.g.:
 *
 * 1. What is photosynthesis?
 * A) Making food from light
 * B) Eating plants
 * C) Breathing
 * D) Sleeping
 * Answer: A
 * Explanation: Plants convert light energy into chemical energy.
 *
 * ---
 *
 * Q: ...
 * a. ...
 * Correct: 2
 * Why: ...
 */
export function parseReviewerPaste(raw: string): ParsedReviewerQuestion[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Try JSON array first
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item): ParsedReviewerQuestion | null => {
            if (!item || typeof item !== "object") return null;
            const o = item as Record<string, unknown>;
            const question = String(o.question ?? o.q ?? "").trim();
            const options = Array.isArray(o.options)
              ? o.options.map((x) => String(x).trim()).filter(Boolean)
              : [];
            let correct =
              typeof o.correct_index === "number"
                ? o.correct_index
                : typeof o.correctIndex === "number"
                  ? o.correctIndex
                  : parseAnswerToken(String(o.answer ?? o.correct ?? "A"));
            if (correct == null) correct = 0;
            const explanation = String(o.explanation ?? o.why ?? o.explain ?? "").trim();
            if (!question || options.length < 2) return null;
            return {
              question,
              options: options.slice(0, 6),
              correct_index: Math.max(0, Math.min(correct, options.length - 1)),
              explanation,
            };
          })
          .filter((x): x is ParsedReviewerQuestion => Boolean(x));
      }
    } catch {
      // fall through to text parser
    }
  }

  const blocks = text
    .split(/\n{2,}|(?:\n\s*[-–—]{3,}\s*\n)/)
    .map((b) => b.trim())
    .filter(Boolean);

  // If no double-newline blocks, split on numbered questions
  const units =
    blocks.length > 1
      ? blocks
      : text
          .split(/(?=(?:^|\n)\s*(?:\d+[.)]|Q[:.)]|Question\s*\d*\s*[:.)]))/i)
          .map((b) => b.trim())
          .filter(Boolean);

  const results: ParsedReviewerQuestion[] = [];

  for (const unit of units) {
    const lines = unit.split("\n").map(cleanLine).filter(Boolean);
    if (lines.length < 3) continue;

    let question = "";
    const options: string[] = [];
    let correct_index = 0;
    let explanation = "";

    for (const line of lines) {
      const ansMatch = line.match(/^(?:answer|correct|ans|key)\s*[:\-–]\s*(.+)$/i);
      if (ansMatch) {
        const idx = parseAnswerToken(ansMatch[1]);
        if (idx != null) correct_index = idx;
        continue;
      }
      const expMatch = line.match(/^(?:explanation|explain|why|rationale|note)\s*[:\-–]\s*(.+)$/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }
      const optMatch = line.match(/^\(?([A-Fa-f1-6])\)?[.)]\s+(.+)$|^([A-Fa-f1-6])[)\]]\s+(.+)$/);
      if (optMatch) {
        const body = (optMatch[2] ?? optMatch[4] ?? "").trim();
        if (body) options.push(body);
        continue;
      }
      if (!question) {
        question = line
          .replace(/^(?:\d+[.)]\s*|Q[:.)]\s*|Question\s*\d*\s*[:.)]\s*)/i, "")
          .trim();
      } else if (explanation && !line.match(/^(?:answer|correct)/i)) {
        explanation = `${explanation} ${line}`.trim();
      } else if (options.length === 0) {
        // continuation of question
        question = `${question} ${line}`.trim();
      }
    }

    // Fallback: lines that look like bullets after question
    if (options.length < 2) {
      const recovered = lines
        .slice(1)
        .filter((l) => !/^(?:answer|correct|explanation|explain|why)/i.test(l))
        .map(stripOptionPrefix)
        .filter((l) => l && l !== question);
      if (recovered.length >= 2) {
        options.push(...recovered.slice(0, 6));
      }
    }

    if (question && options.length >= 2) {
      results.push({
        question,
        options: options.slice(0, 6),
        correct_index: Math.max(0, Math.min(correct_index, options.length - 1)),
        explanation,
      });
    }
  }

  return results;
}
