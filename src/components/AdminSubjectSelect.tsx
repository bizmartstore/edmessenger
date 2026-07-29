import { useEffect, useState } from "react";
import { listSubjects, type Subject } from "@/lib/subjects";

interface AdminSubjectSelectProps {
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  className?: string;
}

/** Subject picker for admin create forms (lessons, quizzes, activities). */
export function AdminSubjectSelect({ value, onChange, required, className }: AdminSubjectSelectProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <select disabled className={className ?? "w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm opacity-60"}>
        <option>Loading subjects…</option>
      </select>
    );
  }

  if (subjects.length === 0) {
    return (
      <p className="text-[11px] text-amber-700 bg-amber-500/10 rounded-xl px-3 py-2">
        No subjects yet — add subjects in Admin → Subjects first.
      </p>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={className ?? "w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm focus:border-primary"}
    >
      <option value="">{required ? "Select subject…" : "No subject"}</option>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.has_password ? " 🔒" : ""}
        </option>
      ))}
    </select>
  );
}
