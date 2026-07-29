import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BookMarked, Lock, LockOpen, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
  type Subject,
} from "@/lib/subjects";

export const Route = createFileRoute("/admin/subjects")({
  component: AdminSubjects,
});

function AdminSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSubjects(await listSubjects());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load subjects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    if (password.trim().length > 0 && password.trim().length < 3) {
      toast.error("Password must be at least 3 characters");
      return;
    }
    setSaving(true);
    try {
      await createSubject(name, password.trim() || null);
      setName("");
      setPassword("");
      toast.success("Subject created");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create subject");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editId || !editName.trim() || saving) return;
    const pw = editPassword.trim();
    if (pw.length > 0 && pw.length < 3) {
      toast.error("Password must be at least 3 characters");
      return;
    }
    setSaving(true);
    try {
      await updateSubject(editId, editName, pw.length > 0 ? pw : undefined);
      setEditId(null);
      setEditName("");
      setEditPassword("");
      toast.success("Subject updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update subject");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s: Subject) {
    setEditId(s.id);
    setEditName(s.name);
    setEditPassword("");
  }

  async function remove(id: string) {
    if (!confirm("Delete this subject? Students who selected it will need to pick again.")) return;
    try {
      await deleteSubject(id);
      toast.success("Subject deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete subject");
    }
  }

  async function clearPassword(id: string) {
    setSaving(true);
    try {
      await updateSubject(id, undefined, "");
      toast.success("Password removed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookMarked className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-bold text-lg">Subjects</h1>
          <p className="text-xs text-muted-foreground">
            Students pick a subject in My Account to see matching lessons, quizzes &amp; activities
          </p>
        </div>
      </div>

      <form onSubmit={addSubject} className="rounded-2xl p-4 bg-card border border-border shadow-card space-y-3">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> New subject
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          placeholder="Subject name (e.g. FABM2, LCS)"
          className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border outline-none text-sm uppercase focus:border-primary"
          maxLength={64}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (optional)"
          className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border outline-none text-sm focus:border-primary"
          maxLength={64}
          autoComplete="new-password"
        />
        <p className="text-[10px] text-muted-foreground">
          Leave password empty for an open subject. Students must enter the password when selecting a locked subject.
        </p>
        <button
          type="submit"
          disabled={saving || name.trim().length < 2}
          className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add subject"}
        </button>
      </form>

      <div className="space-y-2">
        {loading && subjects.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>
        )}
        {!loading && subjects.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8 rounded-2xl border border-dashed border-border">
            No subjects yet. Add FABM2, LCS, or other subjects above.
          </div>
        )}
        {subjects.map((s) => (
          <div key={s.id} className="rounded-2xl bg-card border border-border shadow-card p-4">
            {editId === s.id ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder={s.has_password ? "New password (leave blank to keep)" : "Set password (optional)"}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
                  autoComplete="new-password"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveEdit()}
                    className="flex-1 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="flex-1 py-2 rounded-xl border border-border bg-muted text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl gradient-primary grid place-items-center text-primary-foreground font-bold text-sm shrink-0">
                  {s.name.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    {s.has_password ? (
                      <>
                        <Lock className="h-3 w-3 text-amber-500" /> Password protected
                      </>
                    ) : (
                      <>
                        <LockOpen className="h-3 w-3 text-emerald-500" /> Open
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="p-2 rounded-xl hover:bg-muted text-muted-foreground"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {s.has_password && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void clearPassword(s.id)}
                    className="p-2 rounded-xl hover:bg-amber-500/10 text-amber-600 text-[10px] font-semibold"
                    title="Remove password"
                  >
                    Unlock
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(s.id)}
                  className="p-2 rounded-xl hover:bg-destructive/10 text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
