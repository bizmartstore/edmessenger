export type AcademicQuizScore = {
  id: string;
  title: string;
  score: number;
  max_score: number;
  created_at?: string;
};

export type AcademicPerformanceScore = {
  id: string;
  title: string;
  score: number;
  max_score: number;
  created_at?: string;
};

export type AcademicTermGrade = {
  id: string;
  term_no: 1 | 2 | 3;
  grade_value: string;
};

export const TERM_OPTIONS = [
  { value: "term-1", label: "Term 1" },
  { value: "term-2", label: "Term 2" },
  { value: "term-3", label: "Term 3" },
] as const;

export type AcademicTab = "quizzes" | "performance" | "term-1" | "term-2" | "term-3";

export function parseScore(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}
