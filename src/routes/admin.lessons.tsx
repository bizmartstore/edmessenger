import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { parseReviewerPaste, type ParsedReviewerQuestion } from "@/lib/reviewer-parse";
import { generateReviewerQuestions } from "@/lib/reviewer-ai";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  FileText,
  Plus,
  Eye,
  EyeOff,
  Sparkles,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { notifyRole } from "@/lib/push";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/lessons")({
  component: AdminLessons,
});

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

interface Reviewer {
  id: string;
  lesson_id: string | null;
  title: string;
  description: string | null;
  published: boolean;
  created_at: string;
}

interface ReviewerQ {
  id: string;
  reviewer_id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  order_index: number;
}

function emptyDraft(): ParsedReviewerQuestion {
  return {
    question: "",
    options: ["", "", "", ""],
    correct_index: 0,
    explanation: "",
  };
}

function AdminLessons() {
  const { user } = useAuth();
  const [tab, setTab] = useState("materials");

  // Materials
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  // Reviewers
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Record<string, ReviewerQ[]>>({});
  const [revTitle, setRevTitle] = useState("");
  const [revDesc, setRevDesc] = useState("");
  const [revLessonId, setRevLessonId] = useState<string>("");
  const [createMode, setCreateMode] = useState<"paste" | "ai">("paste");
  const [pasteText, setPasteText] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [draftQs, setDraftQs] = useState<ParsedReviewerQuestion[]>([]);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadLessons() {
    const { data } = await supabase.from("lessons").select("*").order("created_at", { ascending: false });
    setLessons((data ?? []) as Lesson[]);
  }

  async function loadReviewers() {
    const { data, error } = await supabase.from("reviewers").select("*").order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setReviewers((data ?? []) as Reviewer[]);
  }

  useEffect(() => {
    void loadLessons();
    void loadReviewers();
  }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !file || !title.trim()) return;
    setBusy(true);
    try {
      const up = await uploadToBucket("lessons", file, user.id);
      const { error } = await supabase.from("lessons").insert({
        title,
        description: desc || null,
        file_url: up.url,
        file_name: up.name,
        file_size: up.size,
        uploaded_by: user.id,
      });
      if (error) throw error;
      notifyRole("student", "New lesson", title.trim(), "/lessons");
      setTitle("");
      setDesc("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Lesson uploaded");
      void loadLessons();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function delLesson(id: string) {
    if (!confirm("Delete this lesson?")) return;
    await supabase.from("lessons").delete().eq("id", id);
    void loadLessons();
  }

  async function loadQs(reviewerId: string) {
    const { data } = await supabase
      .from("reviewer_questions")
      .select("*")
      .eq("reviewer_id", reviewerId)
      .order("order_index");
    setQuestions((p) => ({ ...p, [reviewerId]: (data ?? []) as ReviewerQ[] }));
  }

  function parsePaste() {
    const parsed = parseReviewerPaste(pasteText);
    if (!parsed.length) {
      toast.error("Could not parse any questions. Check the format.");
      return;
    }
    setDraftQs(parsed);
    toast.success(`Parsed ${parsed.length} question${parsed.length === 1 ? "" : "s"}`);
  }

  async function runAiGenerate() {
    if (!revTitle.trim() && !aiNotes.trim()) {
      toast.error("Add a title or notes for AI to use");
      return;
    }
    setGenerating(true);
    try {
      const qs = await generateReviewerQuestions({
        topic: revTitle.trim() || "Lesson review",
        notes: aiNotes.trim(),
        count: aiCount,
      });
      setDraftQs(qs);
      toast.success(`Generated ${qs.length} question${qs.length === 1 ? "" : "s"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function createReviewer(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !revTitle.trim()) return;
    if (draftQs.length === 0) {
      toast.error("Add at least one question (paste or generate with AI)");
      return;
    }
    const invalid = draftQs.some((q) => !q.question.trim() || q.options.filter((o) => o.trim()).length < 2);
    if (invalid) {
      toast.error("Each question needs text and at least 2 options");
      return;
    }
    setCreating(true);
    try {
      const { data: rev, error } = await supabase
        .from("reviewers")
        .insert({
          title: revTitle.trim(),
          description: revDesc.trim() || null,
          lesson_id: revLessonId || null,
          published: true,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const rows = draftQs.map((q, i) => {
        const options = q.options.map((o) => o.trim()).filter(Boolean);
        return {
          reviewer_id: rev.id,
          question: q.question.trim(),
          options,
          correct_index: Math.max(0, Math.min(q.correct_index, options.length - 1)),
          explanation: q.explanation.trim() || null,
          order_index: i,
        };
      });
      const { error: qErr } = await supabase.from("reviewer_questions").insert(rows);
      if (qErr) throw qErr;
      notifyRole("student", "New lesson reviewer", revTitle.trim(), "/lessons?tab=reviewers");
      setRevTitle("");
      setRevDesc("");
      setRevLessonId("");
      setPasteText("");
      setAiNotes("");
      setDraftQs([]);
      toast.success("Reviewer published");
      void loadReviewers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function togglePublish(r: Reviewer) {
    await supabase.from("reviewers").update({ published: !r.published }).eq("id", r.id);
    void loadReviewers();
  }

  async function deleteReviewer(id: string) {
    if (!confirm("Delete this reviewer and all its questions?")) return;
    await supabase.from("reviewers").delete().eq("id", id);
    void loadReviewers();
  }

  async function updateQuestion(
    reviewerId: string,
    questionId: string,
    patch?: Partial<Pick<ReviewerQ, "question" | "options" | "correct_index" | "explanation">>,
  ) {
    const current = (questions[reviewerId] ?? []).find((x) => x.id === questionId);
    if (!current) return;
    const q = { ...current, ...patch };
    const { error } = await supabase
      .from("reviewer_questions")
      .update({
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
      })
      .eq("id", questionId);
    if (error) toast.error(error.message);
  }

  async function deleteQuestion(id: string, reviewerId: string) {
    await supabase.from("reviewer_questions").delete().eq("id", id);
    void loadQs(reviewerId);
  }

  async function addQuestion(reviewerId: string) {
    const list = questions[reviewerId] ?? [];
    const { error } = await supabase.from("reviewer_questions").insert({
      reviewer_id: reviewerId,
      question: "New question",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correct_index: 0,
      explanation: "",
      order_index: list.length,
    });
    if (error) return toast.error(error.message);
    void loadQs(reviewerId);
  }

  const lessonTitle = (id: string | null) => lessons.find((l) => l.id === id)?.title;

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-2 h-10">
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="reviewers">Reviewers</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-4 space-y-5">
          <form onSubmit={upload} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-2">
            <div className="font-semibold text-sm">Upload lesson / module</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lesson title"
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
              required
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
            />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-semibold"
              required
            />
            {file && (
              <div className="text-[10px] text-muted-foreground">
                {file.name} · {humanSize(file.size)}
              </div>
            )}
            <button
              disabled={busy}
              className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload PDF"}
            </button>
          </form>

          <div className="space-y-3">
            {lessons.map((l) => (
              <div key={l.id} className="rounded-2xl p-3 bg-card border border-border shadow-card flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{l.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {humanSize(l.file_size)} · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                  </div>
                </div>
                <a href={l.file_url} target="_blank" rel="noopener" className="text-[10px] px-2 py-1 rounded-lg bg-muted font-semibold">
                  View
                </a>
                <button onClick={() => delLesson(l.id)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reviewers" className="mt-4 space-y-5">
          <form onSubmit={createReviewer} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-3">
            <div className="font-semibold text-sm">New lesson reviewer</div>
            <input
              value={revTitle}
              onChange={(e) => setRevTitle(e.target.value)}
              placeholder="Reviewer title"
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
              required
            />
            <input
              value={revDesc}
              onChange={(e) => setRevDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
            />
            <select
              value={revLessonId}
              onChange={(e) => setRevLessonId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
            >
              <option value="">Link to lesson (optional)</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateMode("paste")}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  createMode === "paste" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste details
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("ai")}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  createMode === "ai" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> Generate with AI
              </button>
            </div>

            {createMode === "paste" ? (
              <div className="space-y-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Paste questions like:\n\n1. What is photosynthesis?\nA) Making food from light\nB) Eating plants\nC) Breathing\nD) Sleeping\nAnswer: A\nExplanation: Plants convert light into chemical energy.\n\n2. ...`}
                  rows={8}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={parsePaste}
                  className="w-full py-2 rounded-xl bg-muted hover:bg-secondary text-xs font-semibold"
                >
                  Configure pasted details
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  placeholder="Paste lesson notes / key points for Gemini to turn into a reviewer…"
                  rows={6}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-xs"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground shrink-0">Questions</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value) || 5)}
                    className="w-20 px-2 py-1.5 rounded-lg bg-muted border border-border outline-none text-sm"
                  />
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => void runAiGenerate()}
                    className="flex-1 py-2 rounded-xl bg-muted hover:bg-secondary text-xs font-semibold disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "Generate with Gemini"}
                  </button>
                </div>
              </div>
            )}

            {draftQs.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="text-xs font-semibold text-muted-foreground">
                  Preview · {draftQs.length} question{draftQs.length === 1 ? "" : "s"}
                </div>
                {draftQs.map((q, qi) => (
                  <div key={qi} className="rounded-xl p-3 bg-muted/40 border border-border space-y-2">
                    <div className="flex gap-2">
                      <textarea
                        value={q.question}
                        onChange={(e) =>
                          setDraftQs((prev) => prev.map((x, i) => (i === qi ? { ...x, question: e.target.value } : x)))
                        }
                        rows={2}
                        className="flex-1 text-sm font-medium bg-card rounded-lg px-2 py-1.5 outline-none resize-none border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => setDraftQs((prev) => prev.filter((_, i) => i !== qi))}
                        className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 h-fit"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDraftQs((prev) =>
                              prev.map((x, i) => (i === qi ? { ...x, correct_index: oi } : x)),
                            )
                          }
                          className={`h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ${
                            q.correct_index === oi ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"
                          }`}
                        >
                          {q.correct_index === oi && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                        <input
                          value={opt}
                          onChange={(e) =>
                            setDraftQs((prev) =>
                              prev.map((x, i) =>
                                i === qi
                                  ? { ...x, options: x.options.map((o, j) => (j === oi ? e.target.value : o)) }
                                  : x,
                              ),
                            )
                          }
                          className="flex-1 text-sm bg-card rounded-lg px-2 py-1.5 outline-none border border-border"
                        />
                      </div>
                    ))}
                    <input
                      value={q.explanation}
                      onChange={(e) =>
                        setDraftQs((prev) =>
                          prev.map((x, i) => (i === qi ? { ...x, explanation: e.target.value } : x)),
                        )
                      }
                      placeholder="Explanation after answering"
                      className="w-full text-xs bg-card rounded-lg px-2 py-1.5 outline-none border border-border"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDraftQs((prev) => [...prev, emptyDraft()])}
                  className="w-full py-2 rounded-xl bg-muted text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add blank question
                </button>
              </div>
            )}

            <button
              disabled={creating}
              className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {creating ? "Saving…" : "Publish reviewer"}
            </button>
          </form>

          <div className="space-y-3">
            {reviewers.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground rounded-2xl bg-card border border-dashed border-border">
                No reviewers yet.
              </div>
            )}
            {reviewers.map((r) => {
              const open = expanded === r.id;
              const qs = questions[r.id] ?? [];
              return (
                <div key={r.id} className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(open ? null : r.id);
                        if (!open) void loadQs(r.id);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="font-semibold text-sm truncate">{r.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {lessonTitle(r.lesson_id) ? `Lesson: ${lessonTitle(r.lesson_id)}` : "Standalone"}
                        {r.description ? ` · ${r.description}` : ""}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void togglePublish(r)}
                      className={`p-2 rounded-xl text-xs font-semibold ${
                        r.published ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteReviewer(r.id)}
                      className="p-2 rounded-xl text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(open ? null : r.id);
                        if (!open) void loadQs(r.id);
                      }}
                      className="p-2 rounded-xl hover:bg-muted"
                    >
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  {open && (
                    <div className="border-t border-border p-4 space-y-4 bg-muted/30">
                      {qs.map((question) => (
                        <div key={question.id} className="rounded-xl p-3 bg-card border border-border">
                          <div className="flex items-start gap-2">
                            <textarea
                              value={question.question}
                              onChange={(e) =>
                                setQuestions((p) => ({
                                  ...p,
                                  [r.id]: p[r.id].map((x) =>
                                    x.id === question.id ? { ...x, question: e.target.value } : x,
                                  ),
                                }))
                              }
                              onBlur={() => void updateQuestion(r.id, question.id)}
                              className="flex-1 text-sm font-medium bg-transparent outline-none resize-none"
                              rows={2}
                            />
                            <button
                              type="button"
                              onClick={() => void deleteQuestion(question.id, r.id)}
                              className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {question.options.map((opt, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = { ...question, correct_index: i };
                                    setQuestions((p) => ({
                                      ...p,
                                      [r.id]: p[r.id].map((x) => (x.id === question.id ? updated : x)),
                                    }));
                                    void updateQuestion(r.id, question.id, { correct_index: i });
                                  }}
                                  className={`h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ${
                                    question.correct_index === i
                                      ? "border-emerald-500 bg-emerald-500"
                                      : "border-muted-foreground"
                                  }`}
                                >
                                  {question.correct_index === i && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </button>
                                <input
                                  value={opt}
                                  onChange={(e) =>
                                    setQuestions((p) => ({
                                      ...p,
                                      [r.id]: p[r.id].map((x) =>
                                        x.id === question.id
                                          ? {
                                              ...x,
                                              options: x.options.map((o, j) => (j === i ? e.target.value : o)),
                                            }
                                          : x,
                                      ),
                                    }))
                                  }
                                  onBlur={() => void updateQuestion(r.id, question.id)}
                                  className="flex-1 text-sm bg-muted rounded-lg px-2 py-1.5 outline-none"
                                />
                              </div>
                            ))}
                          </div>
                          <input
                            value={question.explanation ?? ""}
                            onChange={(e) =>
                              setQuestions((p) => ({
                                ...p,
                                [r.id]: p[r.id].map((x) =>
                                  x.id === question.id ? { ...x, explanation: e.target.value } : x,
                                ),
                              }))
                            }
                            onBlur={() => void updateQuestion(r.id, question.id)}
                            placeholder="Explanation shown after answering"
                            className="mt-2 w-full text-xs bg-muted rounded-lg px-2 py-1.5 outline-none"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => void addQuestion(r.id)}
                        className="w-full py-2 rounded-xl bg-muted hover:bg-secondary text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add question
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
