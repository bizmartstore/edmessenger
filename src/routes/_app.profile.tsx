import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2, ClipboardList, FolderKanban, Save } from "lucide-react";
import { NotificationStatusCard } from "@/components/NotificationStatusCard";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

interface QuizRow {
  id: string;
  score: number | null;
  created_at: string;
  quizzes: { title: string } | null;
}

interface ActivityRow {
  id: string;
  created_at: string;
  note: string | null;
  activities: { title: string } | null;
}

function ProfilePage() {
  const { user, profile, refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [contact, setContact] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName((profile.full_name ?? "").toUpperCase());
    setSchool(profile.school ?? "");
    setContact(profile.contact_number ?? "");
    setAvatarUrl(profile.avatar_url);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [q, a] = await Promise.all([
        supabase
          .from("quiz_attempts")
          .select("id, score, created_at, quizzes(title)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("activity_submissions")
          .select("id, created_at, note, activities(title)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setQuizzes((q.data ?? []) as unknown as QuizRow[]);
      setActivities((a.data ?? []) as unknown as ActivityRow[]);
    })();
  }, [user]);

  async function onAvatar(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadToBucket("avatars", file, user.id, "profile");
      setAvatarUrl(uploaded.url);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: uploaded.url, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success(`Photo updated (${humanSize(uploaded.size)})`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    try {
      const name = fullName.trim().toUpperCase();
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name || null,
          school: school.trim() || null,
          contact_number: contact.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Profile saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const display = profile as Profile | null;

  return (
    <div className="max-w-md mx-auto px-5 pt-4 pb-8">
      <header className="flex items-center gap-3 mb-5">
        <Link to="/" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">My Account</h1>
          <p className="text-xs text-muted-foreground">Profile, scores &amp; activity</p>
        </div>
      </header>

      <div className="flex flex-col items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative group"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover shadow-card ring-2 ring-primary/20" />
          ) : (
            <div className="h-24 w-24 rounded-full gradient-primary grid place-items-center text-3xl font-bold text-primary-foreground shadow-glow">
              {(fullName || "?")[0]}
            </div>
          )}
          <span className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-card border border-border shadow grid place-items-center group-hover:bg-muted">
            <Camera className="h-4 w-4 text-primary" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onAvatar(e.target.files?.[0])}
        />
        <p className="text-[10px] text-muted-foreground text-center">
          Photo is compressed automatically and shown in chat
        </p>
      </div>

      <div className="space-y-3 rounded-2xl bg-card border border-border p-4 shadow-card">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Full name (capital letters)</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value.toUpperCase())}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
            placeholder="YOUR FULL NAME"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">School</span>
          <input
            value={school}
            onChange={(e) => setSchool(e.target.value.toUpperCase())}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
            placeholder="SCHOOL NAME"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Email (from Google)</span>
          <input
            value={display?.email ?? user?.email ?? ""}
            disabled
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Contact number</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            type="tel"
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
            placeholder="09XXXXXXXXX"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="w-full mt-1 py-3 rounded-2xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save profile"}
        </button>
      </div>

      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-4 w-4 text-emerald-600" />
          <h2 className="font-bold text-sm">Quizzes taken</h2>
        </div>
        <div className="space-y-2">
          {quizzes.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center rounded-2xl border border-dashed border-border">
              No quizzes taken yet
            </div>
          )}
          {quizzes.map((q) => (
            <div key={q.id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{q.quizzes?.title ?? "Quiz"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                </div>
              </div>
              <div className="text-sm font-bold text-emerald-600">Score: {q.score ?? "—"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <FolderKanban className="h-4 w-4 text-sky-600" />
          <h2 className="font-bold text-sm">Activities submitted</h2>
        </div>
        <div className="space-y-2">
          {activities.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center rounded-2xl border border-dashed border-border">
              No activities submitted yet
            </div>
          )}
          {activities.map((a) => (
            <div key={a.id} className="p-3 rounded-2xl bg-card border border-border">
              <div className="text-sm font-semibold truncate">{a.activities?.title ?? "Activity"}</div>
              {a.note && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.note}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
