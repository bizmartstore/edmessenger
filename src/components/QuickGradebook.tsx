import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getInitials, getProfileDisplayName, splitStoredName } from "@/lib/profile-name";
import { parseScore } from "@/lib/academic";

export type GradebookStudent = {
  id: string;
  full_name: string | null;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string | null;
  section?: string | null;
};

type Kind = "quiz" | "performance" | "summative";

type Assessment = {
  id: string;
  kind: Kind;
  section: string | null;
  title: string;
  max_score: number;
};

const KINDS: { key: Kind; label: string; table: string; noun: string }[] = [
  { key: "quiz", label: "Quizzes", table: "academic_quiz_scores", noun: "Quiz" },
  { key: "performance", label: "Performance", table: "academic_performance_scores", noun: "Performance task" },
  { key: "summative", label: "Summative", table: "academic_summative_scores", noun: "Summative test" },
];

const UNASSIGNED = "__unassigned__";

function tableFor(kind: Kind) {
  return KINDS.find((k) => k.key === kind)!.table;
}

function nameParts(s: GradebookStudent) {
  const parsed = splitStoredName(s.full_name);
  return {
    last: (s.last_name ?? parsed.lastName ?? "").trim().toUpperCase(),
    first: (s.first_name ?? parsed.firstName ?? "").trim().toUpperCase(),
    middle: (s.middle_name ?? parsed.middleName ?? "").trim().toUpperCase(),
  };
}

function sortByLastName(list: GradebookStudent[]) {
  return [...list].sort((a, b) => {
    const A = nameParts(a);
    const B = nameParts(b);
    return (
      A.last.localeCompare(B.last, undefined, { sensitivity: "base" }) ||
      A.first.localeCompare(B.first, undefined, { sensitivity: "base" }) ||
      A.middle.localeCompare(B.middle, undefined, { sensitivity: "base" })
    );
  });
}

export function QuickGradebook({ students, onStudentsChanged }: { students: GradebookStudent[]; onStudentsChanged?: () => void }) {
  const [section, setSection] = useState<string>("");
  const [kind, setKind] = useState<Kind>("quiz");
  const [entryMode, setEntryMode] = useState<"assessment" | "student">("assessment");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [busy, setBusy] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newMax, setNewMax] = useState("100");

  const [activeAssessmentId, setActiveAssessmentId] = useState("");
  const [columnScores, setColumnScores] = useState<Record<string, string>>({});

  const [activeStudentId, setActiveStudentId] = useState("");
  const [rowScores, setRowScores] = useState<Record<string, string>>({});

  const [termNo, setTermNo] = useState<1 | 2 | 3>(1);
  const [termGrades, setTermGrades] = useState<Record<string, string>>({});

  const sections = useMemo(() => {
    const set = new Set<string>();
    let hasUnassigned = false;
    for (const s of students) {
      const v = (s.section ?? "").trim();
      if (v) set.add(v.toUpperCase());
      else hasUnassigned = true;
    }
    const list = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { list, hasUnassigned };
  }, [students]);

  useEffect(() => {
    if (section) return;
    if (sections.list.length) setSection(sections.list[0]!);
    else if (sections.hasUnassigned) setSection(UNASSIGNED);
  }, [section, sections]);

  const sectionStudents = useMemo(() => {
    if (!section) return [];
    const filtered = students.filter((s) => {
      const v = (s.section ?? "").trim().toUpperCase();
      return section === UNASSIGNED ? !v : v === section;
    });
    return sortByLastName(filtered);
  }, [students, section]);

  const studentIds = useMemo(() => sectionStudents.map((s) => s.id), [sectionStudents]);
  const activeAssessment = assessments.find((a) => a.id === activeAssessmentId) ?? null;

  const loadAssessments = useCallback(async () => {
    if (!section) return;
    const sectionValue = section === UNASSIGNED ? null : section;
    let q = supabase.from("academic_assessments").select("id, kind, section, title, max_score").eq("kind", kind);
    q = sectionValue == null ? q.is("section", null) : q.eq("section", sectionValue);
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setAssessments((data ?? []) as Assessment[]);
  }, [kind, section]);

  useEffect(() => {
    setActiveAssessmentId("");
    setColumnScores({});
    setRowScores({});
    void loadAssessments();
  }, [loadAssessments]);

  // Load scores for the selected assessment (column entry)
  useEffect(() => {
    if (entryMode !== "assessment" || !activeAssessment || studentIds.length === 0) return;
    void (async () => {
      const { data, error } = await supabase
        .from(tableFor(kind))
        .select("student_id, score")
        .eq("title", activeAssessment.title)
        .in("student_id", studentIds);
      if (error) {
        toast.error(error.message);
        return;
      }
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: { student_id: string; score: number }) => {
        map[row.student_id] = String(row.score ?? "");
      });
      setColumnScores(map);
    })();
  }, [entryMode, activeAssessment, kind, studentIds]);

  // Load all scores of one student (row entry)
  useEffect(() => {
    if (entryMode !== "student" || !activeStudentId) return;
    void (async () => {
      const { data, error } = await supabase
        .from(tableFor(kind))
        .select("title, score")
        .eq("student_id", activeStudentId);
      if (error) {
        toast.error(error.message);
        return;
      }
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: { title: string; score: number }) => {
        map[row.title] = String(row.score ?? "");
      });
      setRowScores(map);
    })();
  }, [entryMode, activeStudentId, kind]);

  // Term grades for the section
  useEffect(() => {
    if (studentIds.length === 0) {
      setTermGrades({});
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from("academic_term_grades")
        .select("student_id, grade_value")
        .eq("term_no", termNo)
        .in("student_id", studentIds);
      if (error) {
        toast.error(error.message);
        return;
      }
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: { student_id: string; grade_value: string }) => {
        map[row.student_id] = row.grade_value;
      });
      setTermGrades(map);
    })();
  }, [termNo, studentIds]);

  async function addAssessment() {
    const title = newTitle.trim();
    if (!title) {
      toast.error("Enter a title, e.g. Quiz 1");
      return;
    }
    const max = parseScore(newMax);
    setBusy(true);
    try {
      const { error } = await supabase.from("academic_assessments").insert({
        kind,
        section: section === UNASSIGNED ? null : section,
        title,
        max_score: max,
      });
      if (error) throw error;
      setNewTitle("");
      await loadAssessments();
      toast.success(`${title} added`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not add assessment");
    } finally {
      setBusy(false);
    }
  }

  async function removeAssessment(a: Assessment) {
    if (!window.confirm(`Remove "${a.title}" from this section? Recorded scores stay saved.`)) return;
    const { error } = await supabase.from("academic_assessments").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (activeAssessmentId === a.id) setActiveAssessmentId("");
    await loadAssessments();
  }

  /** Replace scores for one title across a set of students. */
  async function persist(title: string, max: number, entries: { student_id: string; value: string }[]) {
    const ids = entries.map((e) => e.student_id);
    if (!ids.length) return 0;
    const { error: delError } = await supabase.from(tableFor(kind)).delete().eq("title", title).in("student_id", ids);
    if (delError) throw delError;
    const rows = entries
      .filter((e) => e.value.trim() !== "")
      .map((e) => ({ student_id: e.student_id, title, score: parseScore(e.value), max_score: max }));
    if (rows.length) {
      const { error } = await supabase.from(tableFor(kind)).insert(rows);
      if (error) throw error;
    }
    return rows.length;
  }

  async function saveColumn() {
    if (!activeAssessment) {
      toast.error("Pick an assessment first");
      return;
    }
    setBusy(true);
    try {
      const saved = await persist(
        activeAssessment.title,
        Number(activeAssessment.max_score) || 0,
        sectionStudents.map((s) => ({ student_id: s.id, value: columnScores[s.id] ?? "" })),
      );
      toast.success(`${activeAssessment.title}: saved for ${saved} student(s)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save scores");
    } finally {
      setBusy(false);
    }
  }

  async function saveStudentRow() {
    if (!activeStudentId) {
      toast.error("Pick a student first");
      return;
    }
    setBusy(true);
    try {
      for (const a of assessments) {
        await persist(a.title, Number(a.max_score) || 0, [
          { student_id: activeStudentId, value: rowScores[a.title] ?? "" },
        ]);
      }
      toast.success("Scores saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save scores");
    } finally {
      setBusy(false);
    }
  }

  async function saveTerms() {
    setBusy(true);
    try {
      const nonEmpty = studentIds
        .filter((id) => (termGrades[id] ?? "").trim())
        .map((id) => ({ student_id: id, term_no: termNo, grade_value: (termGrades[id] ?? "").trim() }));
      const emptyIds = studentIds.filter((id) => !(termGrades[id] ?? "").trim());
      if (emptyIds.length) {
        await supabase.from("academic_term_grades").delete().in("student_id", emptyIds).eq("term_no", termNo);
      }
      if (nonEmpty.length) {
        const { error } = await supabase
          .from("academic_term_grades")
          .upsert(nonEmpty, { onConflict: "student_id,term_no" });
        if (error) throw error;
      }
      toast.success("Term grades saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save term grades");
    } finally {
      setBusy(false);
    }
  }

  const kindMeta = KINDS.find((k) => k.key === kind)!;

  return (
    <div className="space-y-4">
      {/* Section picker */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
        <div className="font-bold text-sm">Section</div>
        <div className="text-xs text-muted-foreground mt-1">
          Only students in the selected section can be graded below.
        </div>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="mt-3 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          {sections.list.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {sections.hasUnassigned && <option value={UNASSIGNED}>No section yet</option>}
        </select>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {sectionStudents.length} student{sectionStudents.length === 1 ? "" : "s"} in this section. Set a student&apos;s
          section in the 1-by-1 Student Editor.
        </div>
      </div>

      {/* Kind + entry mode */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-card space-y-3">
        <div className="flex gap-2 flex-wrap">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`px-3 py-2 rounded-2xl text-sm font-semibold transition-all ${
                kind === k.key
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/* Assessment roster */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {kindMeta.label} in this section
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {assessments.length === 0 && (
              <div className="text-xs text-muted-foreground">None yet — create one below.</div>
            )}
            {assessments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold"
              >
                {a.title} <span className="text-muted-foreground">/{a.max_score}</span>
                <button
                  type="button"
                  onClick={() => void removeAssessment(a)}
                  className="ml-1 text-destructive hover:opacity-70"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr,90px,auto] gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`New ${kindMeta.noun.toLowerCase()} title`}
              className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
              type="number"
              min={0}
              placeholder="Max"
              className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void addAssessment()}
              className="rounded-xl gradient-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground inline-flex items-center gap-1 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {(["assessment", "student"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setEntryMode(m)}
              className={`flex-1 py-2 rounded-2xl text-xs font-semibold transition-all ${
                entryMode === m
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {m === "assessment" ? "By assessment (whole section)" : "By student (all assessments)"}
            </button>
          ))}
        </div>
      </div>

      {/* Entry grid */}
      {entryMode === "assessment" ? (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-sm">Score the whole section</div>
              <div className="text-xs text-muted-foreground mt-1">Pick one assessment and type every score.</div>
            </div>
            <button
              type="button"
              disabled={busy || !activeAssessment || sectionStudents.length === 0}
              onClick={() => void saveColumn()}
              className="rounded-2xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save scores"}
            </button>
          </div>

          <select
            value={activeAssessmentId}
            onChange={(e) => {
              setActiveAssessmentId(e.target.value);
              setColumnScores({});
            }}
            className="mt-3 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Select {kindMeta.noun.toLowerCase()}…</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} (max {a.max_score})
              </option>
            ))}
          </select>

          <div className="mt-4 space-y-2">
            {sectionStudents.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">No students in this section.</div>
            ) : (
              sectionStudents.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr,110px] items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-xl gradient-primary grid place-items-center text-primary-foreground font-bold shrink-0">
                      {getInitials(s)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{getProfileDisplayName(s) || "Student"}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{s.email}</div>
                    </div>
                  </div>
                  <input
                    value={columnScores[s.id] ?? ""}
                    onChange={(e) => setColumnScores((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    disabled={!activeAssessment}
                    type="number"
                    min={0}
                    placeholder="Score"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-sm">Score one student</div>
              <div className="text-xs text-muted-foreground mt-1">
                Pick a student, then fill in every {kindMeta.label.toLowerCase()} score at once.
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !activeStudentId || assessments.length === 0}
              onClick={() => void saveStudentRow()}
              className="rounded-2xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save scores"}
            </button>
          </div>

          <select
            value={activeStudentId}
            onChange={(e) => {
              setActiveStudentId(e.target.value);
              setRowScores({});
            }}
            className="mt-3 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Select student…</option>
            {sectionStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {getProfileDisplayName(s) || s.email}
              </option>
            ))}
          </select>

          <div className="mt-4 space-y-2">
            {assessments.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                Create {kindMeta.label.toLowerCase()} above first.
              </div>
            ) : (
              assessments.map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr,110px] items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.title}</div>
                    <div className="text-[10px] text-muted-foreground">Max {a.max_score}</div>
                  </div>
                  <input
                    value={rowScores[a.title] ?? ""}
                    onChange={(e) => setRowScores((prev) => ({ ...prev, [a.title]: e.target.value }))}
                    disabled={!activeStudentId}
                    type="number"
                    min={0}
                    placeholder="Score"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Term grades */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-bold text-sm">Final Grades (this section)</div>
            <div className="text-xs text-muted-foreground mt-1">Enter term grades by student, then save once.</div>
          </div>
          <button
            type="button"
            disabled={busy || sectionStudents.length === 0}
            onClick={() => void saveTerms()}
            className="rounded-2xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save term grades"}
          </button>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTermNo(n)}
              className={`px-3 py-2 rounded-2xl text-sm font-semibold transition-all ${
                termNo === n
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              Term {n}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {sectionStudents.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No students in this section.</div>
          ) : (
            sectionStudents.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr,170px] items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-xl gradient-primary grid place-items-center text-primary-foreground font-bold shrink-0">
                    {getInitials(s)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{getProfileDisplayName(s) || "Student"}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{s.email}</div>
                  </div>
                </div>
                <input
                  value={termGrades[s.id] ?? ""}
                  onChange={(e) => setTermGrades((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Grade (e.g. A, 95)"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
            ))
          )}
        </div>
      </div>

      {onStudentsChanged && <span className="hidden" />}
    </div>
  );
}
