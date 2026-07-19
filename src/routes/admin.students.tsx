import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Camera, Pencil, Save, X } from "lucide-react";

export const Route = createFileRoute("/admin/students")({
  component: AdminStudents,
});

interface Row {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  school: string | null;
  contact_number: string | null;
  created_at: string;
}

function AdminStudents() {
  const [students, setStudents] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [contact, setContact] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setStudents((data ?? []) as Row[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(s: Row) {
    setEditing(s);
    setFullName((s.full_name ?? "").toUpperCase());
    setSchool((s.school ?? "").toUpperCase());
    setContact(s.contact_number ?? "");
    setAvatarUrl(s.avatar_url);
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
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim().toUpperCase() || null,
          school: school.trim().toUpperCase() || null,
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

  return (
    <div>
      <div className="text-sm mb-3">
        <span className="font-bold">{students.length}</span> student{students.length === 1 ? "" : "s"} registered
      </div>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        {students.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
            {s.avatar_url ? (
              <img src={s.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold">
                {(s.full_name ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{s.full_name ?? "Student"}</div>
              <div className="text-xs text-muted-foreground truncate">{s.email}</div>
              {(s.school || s.contact_number) && (
                <div className="text-[10px] text-muted-foreground truncate">
                  {[s.school, s.contact_number].filter(Boolean).join(" · ")}
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

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-glow p-5 animate-fade-up">
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
                    {(fullName || "?")[0]}
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

            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Full name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value.toUpperCase())}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
