import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyUsers } from "@/lib/push";

interface GroupQuiz {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  published: boolean;
  created_by: string;
  created_at: string;
}

interface GroupQuizQuestion {
  id: string;
  quiz_id: string;
  question: string;
  options: string[];
  correct_index: number;
  order_index: number;
}

interface AttemptResult {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  score: number;
  total: number;
  created_at: string;
}

interface Props {
  groupId: string;
  groupName: string;
  userId: string;
  isOwner: boolean;
  onClose: () => void;
}

export function GroupQuizzesPanel({ groupId, groupName, userId, isOwner, onClose }: Props) {
  const [quizzes, setQuizzes] = useState<GroupQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GroupQuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ score: number; total: number } | null>(null);
  const [results, setResults] = useState<AttemptResult[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editQs, setEditQs] = useState<GroupQuizQuestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadQuizzes = useCallback(async () => {
    const { data, error } = await supabase
      .from("group_quizzes")
      .select("id, group_id, title, description, published, created_by, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setQuizzes([]);
    } else {
      setQuizzes((data ?? []) as GroupQuiz[]);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    void loadQuizzes();
  }, [loadQuizzes]);

  async function loadQuestions(quizId: string) {
    const { data } = await supabase
      .from("group_quiz_questions")
      .select("*")
      .eq("quiz_id", quizId)
      .order("order_index");
    const list = ((data ?? []) as GroupQuizQuestion[]).map((q) => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : (q.options as unknown as string[]),
    }));
    setQuestions(list);
    return list;
  }

  async function openTake(quiz: GroupQuiz) {
    setActiveQuizId(quiz.id);
    setSubmitted(null);
    setAnswers({});
    const qs = await loadQuestions(quiz.id);
    const { data: att } = await supabase
      .from("group_quiz_attempts")
      .select("score, answers")
      .eq("quiz_id", quiz.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (att) {
      setAnswers((att.answers as Record<string, number>) ?? {});
      setSubmitted({ score: att.score, total: qs.length });
    }
    if (isOwner) {
      const { data } = await supabase.rpc("list_group_quiz_results", { p_quiz: quiz.id });
      setResults((data ?? []) as AttemptResult[]);
    } else {
      setResults([]);
    }
  }

  async function createQuiz() {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("group_quizzes")
        .insert({
          group_id: groupId,
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          created_by: userId,
          published: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      const quizId = data.id as string;
      await supabase.from("group_quiz_questions").insert({
        quiz_id: quizId,
        question: "Sample question — edit me",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct_index: 0,
        order_index: 0,
      });
      setNewTitle("");
      setNewDesc("");
      toast.success("Quiz created — add questions, then publish");
      await loadQuizzes();
      setEditingId(quizId);
      const qs = await loadQuestions(quizId);
      setEditQs(qs);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create quiz");
    } finally {
      setCreating(false);
    }
  }

  async function openEdit(quizId: string) {
    setEditingId(quizId);
    setActiveQuizId(null);
    const qs = await loadQuestions(quizId);
    setEditQs(qs);
  }

  async function saveQuestion(q: GroupQuizQuestion) {
    const { error } = await supabase
      .from("group_quiz_questions")
      .update({
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
      })
      .eq("id", q.id);
    if (error) toast.error(error.message);
  }

  async function addQuestion(quizId: string) {
    const order = editQs.length;
    const { error } = await supabase.from("group_quiz_questions").insert({
      quiz_id: quizId,
      question: "New question",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correct_index: 0,
      order_index: order,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const qs = await loadQuestions(quizId);
    setEditQs(qs);
  }

  async function deleteQuestion(id: string, quizId: string) {
    await supabase.from("group_quiz_questions").delete().eq("id", id);
    const qs = await loadQuestions(quizId);
    setEditQs(qs);
  }

  async function togglePublish(quiz: GroupQuiz) {
    const next = !quiz.published;
    const { error } = await supabase.from("group_quizzes").update({ published: next }).eq("id", quiz.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (next) {
      const { data: memberIds } = await supabase.rpc("get_group_member_ids", { p_group: groupId });
      const ids = ((memberIds as string[] | null) ?? []).filter((id) => id !== userId);
      if (ids.length) {
        notifyUsers(ids, `${groupName} · New quiz`, quiz.title, `/group/${groupId}`);
      }
      toast.success("Quiz published — members notified");
    } else {
      toast.success("Quiz unpublished");
    }
    void loadQuizzes();
  }

  async function deleteQuiz(id: string) {
    if (!confirm("Delete this group quiz?")) return;
    await supabase.from("group_quizzes").delete().eq("id", id);
    if (editingId === id) setEditingId(null);
    if (activeQuizId === id) setActiveQuizId(null);
    void loadQuizzes();
  }

  async function submitQuiz() {
    if (!activeQuizId) return;
    const score = questions.reduce((n, q) => n + (answers[q.id] === q.correct_index ? 1 : 0), 0);
    const { error } = await supabase.from("group_quiz_attempts").upsert(
      {
        quiz_id: activeQuizId,
        user_id: userId,
        answers,
        score,
      },
      { onConflict: "quiz_id,user_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted({ score, total: questions.length });
    toast.success(`You scored ${score}/${questions.length}!`);
    if (isOwner) {
      const { data } = await supabase.rpc("list_group_quiz_results", { p_quiz: activeQuizId });
      setResults((data ?? []) as AttemptResult[]);
    }
  }

  const visible = quizzes.filter((q) => q.published || isOwner);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-3xl border border-border bg-card shadow-glow p-4 space-y-3 animate-pop">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <div className="font-bold text-sm flex-1">Group quizzes</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isOwner
            ? "Create review quizzes for your members. Publish when ready."
            : "Take quizzes posted by the group owner."}
        </p>

        {isOwner && !editingId && !activeQuizId && (
          <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-semibold">New quiz</div>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Quiz title"
              maxLength={120}
              className="w-full px-3 py-2 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={creating || newTitle.trim().length < 2}
              onClick={() => void createQuiz()}
              className="w-full py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Create quiz
            </button>
          </div>
        )}

        {editingId && (
          <div className="space-y-3">
            <button type="button" onClick={() => setEditingId(null)} className="text-xs text-primary font-medium">
              ← Back to list
            </button>
            {editQs.map((q) => (
              <div key={q.id} className="rounded-2xl border border-border p-3 space-y-2">
                <div className="flex gap-2">
                  <textarea
                    value={q.question}
                    onChange={(e) =>
                      setEditQs((list) => list.map((x) => (x.id === q.id ? { ...x, question: e.target.value } : x)))
                    }
                    onBlur={() => void saveQuestion(q)}
                    rows={2}
                    className="flex-1 text-sm bg-muted rounded-xl px-2 py-1.5 outline-none resize-none"
                  />
                  <button type="button" onClick={() => void deleteQuestion(q.id, editingId)} className="text-destructive p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {q.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...q, correct_index: i };
                        setEditQs((list) => list.map((x) => (x.id === q.id ? updated : x)));
                        void saveQuestion(updated);
                      }}
                      className={`h-5 w-5 rounded-full border-2 shrink-0 ${
                        q.correct_index === i ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"
                      }`}
                    />
                    <input
                      value={opt}
                      onChange={(e) =>
                        setEditQs((list) =>
                          list.map((x) =>
                            x.id === q.id
                              ? { ...x, options: x.options.map((o, j) => (j === i ? e.target.value : o)) }
                              : x,
                          ),
                        )
                      }
                      onBlur={() => void saveQuestion(q)}
                      className="flex-1 text-sm bg-muted rounded-lg px-2 py-1.5 outline-none"
                    />
                  </div>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() => void addQuestion(editingId)}
              className="w-full py-2 rounded-xl bg-muted text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          </div>
        )}

        {activeQuizId && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setActiveQuizId(null);
                setSubmitted(null);
              }}
              className="text-xs text-primary font-medium"
            >
              ← Back to list
            </button>
            {submitted && (
              <div className="rounded-2xl p-3 gradient-hero text-white text-sm font-bold">
                Score: {submitted.score} / {submitted.total}
              </div>
            )}
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-border p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Q{i + 1}</div>
                <div className="text-sm font-semibold">{q.question}</div>
                {q.options.map((opt, j) => {
                  const chosen = answers[q.id] === j;
                  const correct = submitted && q.correct_index === j;
                  const wrong = submitted && chosen && q.correct_index !== j;
                  return (
                    <button
                      key={j}
                      type="button"
                      disabled={!!submitted}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: j }))}
                      className={`w-full text-left px-3 py-2 rounded-xl border text-sm ${
                        correct
                          ? "border-emerald-500 bg-emerald-500/10"
                          : wrong
                            ? "border-destructive bg-destructive/10"
                            : chosen
                              ? "border-primary bg-primary/10"
                              : "border-border"
                      }`}
                    >
                      {correct && <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />}
                      {opt}
                    </button>
                  );
                })}
              </div>
            ))}
            {!submitted && questions.length > 0 && (
              <button
                type="button"
                disabled={Object.keys(answers).length !== questions.length}
                onClick={() => void submitQuiz()}
                className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
              >
                Submit answers
              </button>
            )}
            {isOwner && results.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-xs font-semibold">Member results</div>
                {results.map((r) => (
                  <div key={r.user_id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate font-medium">{r.full_name ?? "Student"}</span>
                    <span className="text-muted-foreground">
                      {r.score}/{r.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!editingId && !activeQuizId && (
          <div className="space-y-2">
            {loading && <div className="text-xs text-muted-foreground text-center py-4">Loading…</div>}
            {!loading && visible.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                {isOwner ? "No quizzes yet — create one above." : "No published quizzes yet."}
              </div>
            )}
            {visible.map((q) => (
              <div key={q.id} className="rounded-2xl border border-border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{q.title}</div>
                    {q.description && <div className="text-[11px] text-muted-foreground line-clamp-2">{q.description}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {q.published ? "Published" : "Draft"}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void togglePublish(q)} className="p-1.5 rounded-lg hover:bg-muted">
                        {q.published ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => void openEdit(q.id)} className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-muted">
                        Edit
                      </button>
                      <button type="button" onClick={() => void deleteQuiz(q.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {(q.published || isOwner) && (
                  <button
                    type="button"
                    onClick={() => void openTake(q)}
                    className="w-full py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold"
                  >
                    {isOwner ? "Preview / results" : "Take quiz"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
