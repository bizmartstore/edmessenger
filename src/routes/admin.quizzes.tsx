import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/quizzes")({
  component: AdminQuizzes,
});

interface Quiz { id: string; title: string; description: string | null; published: boolean }
interface Q { id: string; quiz_id: string; question: string; options: string[]; correct_index: number; order_index: number }

function AdminQuizzes() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Record<string, Q[]>>({});
  const [newTitle, setNewTitle] = useState(""); const [newDesc, setNewDesc] = useState("");

  async function load() {
    const { data } = await supabase.from("quizzes").select("*").order("created_at", { ascending: false });
    setQuizzes((data ?? []) as Quiz[]);
  }
  useEffect(() => { load(); }, []);

  async function loadQs(quizId: string) {
    const { data } = await supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("order_index");
    setQuestions((p) => ({ ...p, [quizId]: (data ?? []) as Q[] }));
  }

  async function createQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const { error } = await supabase.from("quizzes").insert({ title: newTitle, description: newDesc || null });
    if (error) return toast.error(error.message);
    setNewTitle(""); setNewDesc(""); load();
    toast.success("Quiz created");
  }

  async function togglePublish(q: Quiz) {
    const next = !q.published;
    await supabase.from("quizzes").update({ published: next }).eq("id", q.id);
    load();
  }

  async function deleteQuiz(id: string) {
    if (!confirm("Delete this quiz and all its questions?")) return;
    await supabase.from("quizzes").delete().eq("id", id);
    load();
  }

  async function addQuestion(quizId: string) {
    const list = questions[quizId] ?? [];
    const order = list.length;
    const { error } = await supabase.from("quiz_questions").insert({
      quiz_id: quizId,
      question: "New question",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correct_index: 0,
      order_index: order,
    });
    if (error) return toast.error(error.message);
    loadQs(quizId);
  }

  async function updateQuestion(q: Q) {
    const { error } = await supabase.from("quiz_questions").update({
      question: q.question, options: q.options, correct_index: q.correct_index,
    }).eq("id", q.id);
    if (error) toast.error(error.message);
  }

  async function deleteQuestion(id: string, quizId: string) {
    await supabase.from("quiz_questions").delete().eq("id", id);
    loadQs(quizId);
  }

  return (
    <div>
      <form onSubmit={createQuiz} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-2">
        <div className="font-semibold text-sm">New quiz</div>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm" />
        <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm" />
        <button className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5">
          <Plus className="h-4 w-4" /> Create quiz
        </button>
      </form>

      <div className="mt-5 space-y-3">
        {quizzes.map((q) => {
          const open = expanded === q.id;
          const qs = questions[q.id] ?? [];
          return (
            <div key={q.id} className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <button
                  onClick={() => { setExpanded(open ? null : q.id); if (!open) loadQs(q.id); }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="font-semibold text-sm truncate">{q.title}</div>
                  {q.description && <div className="text-xs text-muted-foreground truncate">{q.description}</div>}
                </button>
                <button onClick={() => togglePublish(q)} className={`p-2 rounded-xl text-xs font-semibold ${q.published ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                  {q.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => deleteQuiz(q.id)} className="p-2 rounded-xl text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setExpanded(open ? null : q.id); if (!open) loadQs(q.id); }} className="p-2 rounded-xl hover:bg-muted">
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
                          onChange={(e) => setQuestions((p) => ({ ...p, [q.id]: p[q.id].map((x) => x.id === question.id ? { ...x, question: e.target.value } : x) }))}
                          onBlur={() => updateQuestion(question)}
                          className="flex-1 text-sm font-medium bg-transparent outline-none resize-none"
                          rows={1}
                        />
                        <button onClick={() => deleteQuestion(question.id, q.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {question.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const updated = { ...question, correct_index: i };
                                setQuestions((p) => ({ ...p, [q.id]: p[q.id].map((x) => x.id === question.id ? updated : x) }));
                                updateQuestion(updated);
                              }}
                              className={`h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ${question.correct_index === i ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"}`}
                            >
                              {question.correct_index === i && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </button>
                            <input
                              value={opt}
                              onChange={(e) => setQuestions((p) => ({ ...p, [q.id]: p[q.id].map((x) => x.id === question.id ? { ...x, options: x.options.map((o, j) => j === i ? e.target.value : o) } : x) }))}
                              onBlur={() => updateQuestion(question)}
                              className="flex-1 text-sm bg-muted rounded-lg px-2 py-1.5 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => addQuestion(q.id)} className="w-full py-2 rounded-xl bg-muted hover:bg-secondary text-xs font-semibold flex items-center justify-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add question
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
