import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Camera, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildFullName, getInitials, getProfileDisplayName, splitStoredName } from "@/lib/profile-name";
import { QuickGradebook } from "@/components/QuickGradebook";
import { parseScore, TERM_OPTIONS, type AcademicPerformanceScore, type AcademicQuizScore, type AcademicTab, type AcademicTermGrade } from "@/lib/academic";

export const Route = createFileRoute("/admin/students")({
  component: AdminStudents,
});

interface Row {
  id: string;
  full_name: string | null;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string | null;
  avatar_url: string | null;
  school: string | null;
  contact_number: string | null;
  section: string | null;
  created_at: string;
}

function AdminStudents() {
  const [students, setStudents] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"single" | "gradebook">("single");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [school, setSchool] = useState("");
  const [sectionValue, setSectionValue] = useState("");
  const [contact, setContact] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<AcademicTab | "profile">("profile");
  const [quizScores, setQuizScores] = useState<AcademicQuizScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<AcademicPerformanceScore[]>([]);
  const [termGrades, setTermGrades] = useState<AcademicTermGrade[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);


  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setStudents((data ?? []) as Row[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(s: Row) {
    const parsed = splitStoredName(s.full_name);
    setEditing(s);
    setActiveTab("profile");
    setLastName((s.last_name ?? parsed.lastName ?? "").toUpperCase());
    setFirstName((s.first_name ?? parsed.firstName ?? "").toUpperCase());
    setMiddleName((s.middle_name ?? parsed.middleName ?? "").toUpperCase());
    setSchool((s.school ?? "").toUpperCase());
    setSectionValue((s.section ?? "").toUpperCase());
    setContact(s.contact_number ?? "");
    setAvatarUrl(s.avatar_url);
    void loadAcademic(s.id);
  }

  async function loadAcademic(studentId: string) {
    const [quizRes, performanceRes, gradesRes] = await Promise.all([
      supabase
        .from("academic_quiz_scores")
        .select("id, title, score, max_score, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("academic_performance_scores")
        .select("id, title, score, max_score, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("academic_term_grades")
        .select("id, term_no, grade_value")
        .eq("student_id", studentId)
        .order("term_no", { ascending: true }),
    ]);

    setQuizScores((quizRes.data ?? []) as AcademicQuizScore[]);
    setPerformanceScores((performanceRes.data ?? []) as AcademicPerformanceScore[]);
    setTermGrades((gradesRes.data ?? []) as AcademicTermGrade[]);
  }

  async function onAvatar(file: File | undefined) {
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadToBucket("avatars", file, editing.id, "profile");
      setAvatarUrl(uploaded.url);
      toast.success(`Photo ready (${humanSize(uploaded.size)})`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    const nextLast = lastName.trim().toUpperCase();
    const nextFirst = firstName.trim().toUpperCase();
    const nextMiddle = middleName.trim().toUpperCase();
    if (!nextLast || !nextFirst) {
      toast.error("Last name and first name are required");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          last_name: nextLast,
          first_name: nextFirst,
          middle_name: nextMiddle || null,
          full_name: buildFullName(nextLast, nextFirst, nextMiddle) || null,
          school: school.trim().toUpperCase() || null,
          section: sectionValue.trim().toUpperCase() || null,
          contact_number: contact.trim() || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Profile updated");
      setEditing(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addAcademicRow(table: "academic_quiz_scores" | "academic_performance_scores") {
    if (!editing) return;
    const title = table === "academic_quiz_scores" ? "New Quiz" : "New Performance";
    const { error } = await supabase.from(table).insert({
      student_id: editing.id,
      title,
      score: 0,
      max_score: 0,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadAcademic(editing.id);
  }

  async function updateAcademicRow(
    table: "academic_quiz_scores" | "academic_performance_scores",
    id: string,
    patch: Record<string, string | number>,
  ) {
    const { id: _id, ...payload } = patch;
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteAcademicRow(table: "academic_quiz_scores" | "academic_performance_scores", id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (editing) await loadAcademic(editing.id);
  }

  async function saveTermGrade(termNo: 1 | 2 | 3, gradeValue: string) {
    if (!editing) return;
    const clean = gradeValue.trim();
    if (!clean) {
      const existing = termGrades.find((row) => row.term_no === termNo);
      if (!existing) return;
      const { error } = await supabase.from("academic_term_grades").delete().eq("id", existing.id);
      if (error) toast.error(error.message);
      else await loadAcademic(editing.id);
      return;
    }

    const { error } = await supabase.from("academic_term_grades").upsert(
      {
        student_id: editing.id,
        term_no: termNo,
        grade_value: clean,
      },
      { onConflict: "student_id,term_no" },
    );
    if (error) toast.error(error.message);
    else await loadAcademic(editing.id);
  }

  function getNameParts(s: Row) {
    const parsed = splitStoredName(s.full_name);
    return {
      last: (s.last_name ?? parsed.lastName ?? "").trim().toUpperCase(),
      first: (s.first_name ?? parsed.firstName ?? "").trim().toUpperCase(),
      middle: (s.middle_name ?? parsed.middleName ?? "").trim().toUpperCase(),
    };
  }

  function sortByLastName(list: Row[]) {
    return [...list].sort((a, b) => {
      const A = getNameParts(a);
      const B = getNameParts(b);
      return (
        A.last.localeCompare(B.last, undefined, { sensitivity: "base" }) ||
        A.first.localeCompare(B.first, undefined, { sensitivity: "base" }) ||
        A.middle.localeCompare(B.middle, undefined, { sensitivity: "base" })
      );
    });
  }

  function uniqueTitlesFromRows(rows: { title: string; max_score: number | null }[]) {
    const map = new Map<string, number>();
    for (const row of rows) {
      const title = (row.title ?? "").trim();
      if (!title) continue;
      if (!map.has(title)) map.set(title, Number(row.max_score ?? 0) || 0);
    }
    return [...map.entries()]
      .map(([title, max_score]) => ({ title, max_score }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }

  const filteredStudents = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = !q
      ? students
      : students.filter(
          (student) =>
            getProfileDisplayName(student).includes(q) ||
            (student.email ?? "").toUpperCase().includes(q),
        );
    return sortByLastName(list);
  }, [query, students]);

  const alphabeticalStudents = useMemo(() => sortByLastName(students), [students]);



  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setMode("single");
          }}
          className={`flex-1 py-2 rounded-2xl text-sm font-semibold transition-all ${
            mode === "single" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground hover:bg-secondary"
          }`}
        >
          1-by-1 Student Editor
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setMode("gradebook");
          }}
          className={`flex-1 py-2 rounded-2xl text-sm font-semibold transition-all ${
            mode === "gradebook" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground hover:bg-secondary"
          }`}
        >
          Quick Gradebook
        </button>
      </div>

      {mode === "single" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by last name, first name, middle name, or email"
            className="mb-3 w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <div className="text-sm mb-3">
            <span className="font-bold">{students.length}</span> student{students.length === 1 ? "" : "s"} registered
          </div>
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {filteredStudents.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                {s.avatar_url ? (
                  <img src={s.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold">
                    {getInitials(s)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{getProfileDisplayName(s) || "Student"}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                  {(s.school || s.section || s.contact_number) && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      {[s.section, s.school, s.contact_number].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="p-2 rounded-xl hover:bg-muted text-primary"
                  title="Edit profile"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <div className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                  Joined {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
          <QuickGradebook students={students} />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-card border border-border shadow-glow p-5 animate-fade-up max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Edit student</h2>
              <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-xl hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 mb-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-full gradient-primary grid place-items-center text-2xl font-bold text-primary-foreground">
                    {getInitials({ first_name: firstName, last_name: lastName, full_name: editing.full_name })}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-card border grid place-items-center">
                  <Camera className="h-3.5 w-3.5" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onAvatar(e.target.files?.[0])}
              />
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AcademicTab | "profile")} className="w-full">
              <div className="overflow-x-auto pb-2">
                <TabsList className="inline-flex h-auto min-w-max gap-1 rounded-2xl p-1">
                  <TabsTrigger value="profile" className="rounded-xl px-3 py-2 text-xs">Profile</TabsTrigger>
                  <TabsTrigger value="quizzes" className="rounded-xl px-3 py-2 text-xs">Quizzes</TabsTrigger>
                  <TabsTrigger value="performance" className="rounded-xl px-3 py-2 text-xs">Performance</TabsTrigger>
                  {TERM_OPTIONS.map((term) => (
                    <TabsTrigger key={term.value} value={term.value} className="rounded-xl px-3 py-2 text-xs">
                      {term.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="profile" className="space-y-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Last name</span>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value.toUpperCase())}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">First name</span>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value.toUpperCase())}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Middle name (optional)</span>
                  <input
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value.toUpperCase())}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">School</span>
                  <input
                    value={school}
                    onChange={(e) => setSchool(e.target.value.toUpperCase())}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Section</span>
                  <input
                    value={sectionValue}
                    onChange={(e) => setSectionValue(e.target.value.toUpperCase())}
                    placeholder="e.g. GRADE 7 - RIZAL"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</span>
                  <input
                    value={editing.email ?? ""}
                    disabled
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Contact number</span>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="w-full py-3 rounded-2xl gradient-primary text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
                </button>
              </TabsContent>

              <TabsContent value="quizzes">
                <AcademicRowsEditor
                  rows={quizScores}
                  addLabel="Add quiz score"
                  emptyLabel="No quiz scores yet."
                  onAdd={() => void addAcademicRow("academic_quiz_scores")}
                  onChange={(row) => {
                    setQuizScores((prev) => prev.map((item) => (item.id === row.id ? row : item)));
                    void updateAcademicRow("academic_quiz_scores", row.id, row);
                  }}
                  onDelete={(id) => void deleteAcademicRow("academic_quiz_scores", id)}
                />
              </TabsContent>

              <TabsContent value="performance">
                <AcademicRowsEditor
                  rows={performanceScores}
                  addLabel="Add performance score"
                  emptyLabel="No performance scores yet."
                  onAdd={() => void addAcademicRow("academic_performance_scores")}
                  onChange={(row) => {
                    setPerformanceScores((prev) => prev.map((item) => (item.id === row.id ? row : item)));
                    void updateAcademicRow("academic_performance_scores", row.id, row);
                  }}
                  onDelete={(id) => void deleteAcademicRow("academic_performance_scores", id)}
                />
              </TabsContent>

              {TERM_OPTIONS.map((term, index) => (
                <TabsContent key={term.value} value={term.value}>
                  <TermGradeEditor
                    termLabel={term.label}
                    currentValue={termGrades.find((row) => row.term_no === index + 1)?.grade_value ?? ""}
                    onSave={(value) => void saveTermGrade((index + 1) as 1 | 2 | 3, value)}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}

function AcademicRowsEditor({
  rows,
  addLabel,
  emptyLabel,
  onAdd,
  onChange,
  onDelete,
}: {
  rows: { id: string; title: string; score: number; max_score: number }[];
  addLabel: string;
  emptyLabel: string;
  onAdd: () => void;
  onChange: (row: { id: string; title: string; score: number; max_score: number }) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-2xl bg-muted px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-secondary"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}
      {rows.map((row) => (
        <div key={row.id} className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
          <input
            value={row.title}
            onChange={(e) => onChange({ ...row, title: e.target.value })}
            onBlur={(e) => onChange({ ...row, title: e.target.value })}
            placeholder="Title"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={String(row.score)}
              onChange={(e) => onChange({ ...row, score: parseScore(e.target.value) })}
              placeholder="Score"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={String(row.max_score)}
              onChange={(e) => onChange({ ...row, max_score: parseScore(e.target.value) })}
              placeholder="Max score"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onDelete(row.id)}
              className="rounded-xl p-2 text-destructive hover:bg-destructive/10"
              title="Delete row"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TermGradeEditor({
  termLabel,
  currentValue,
  onSave,
}: {
  termLabel: string;
  currentValue: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(currentValue);

  useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
      <div className="text-sm font-semibold">{termLabel} final grade</div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Example: 95 or PASSED"
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={() => onSave(value)}
        className="w-full rounded-2xl gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
      >
        Save {termLabel}
      </button>
    </div>
  );
}
