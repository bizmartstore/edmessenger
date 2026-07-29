import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { buildFullName, getInitials, splitStoredName } from "@/lib/profile-name";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2, ClipboardList, Coins, FolderKanban, Save, BookMarked, Lock } from "lucide-react";
import { NotificationStatusCard } from "@/components/NotificationStatusCard";
import { formatDistanceToNow } from "date-fns";
import { useGcoins } from "@/hooks/useGcoins";
import { listSubjects, selectSubject, type Subject } from "@/lib/subjects";

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
  const { wallet, loading: gcoinsLoading } = useGcoins();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [school, setSchool] = useState("");
  const [contact, setContact] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectPassword, setSubjectPassword] = useState("");
  const [pickingSubject, setPickingSubject] = useState<string | null>(null);
  const [subjectBusy, setSubjectBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    const parsed = splitStoredName(profile.full_name);
    setLastName((profile.last_name ?? parsed.lastName ?? "").toUpperCase());
    setFirstName((profile.first_name ?? parsed.firstName ?? "").toUpperCase());
    setMiddleName((profile.middle_name ?? parsed.middleName ?? "").toUpperCase());
    setSchool(profile.school ?? "");
    setContact(profile.contact_number ?? "");
    setAvatarUrl(profile.avatar_url);
  }, [profile]);

  useEffect(() => {
    void listSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

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

  async function pickSubject(subject: Subject) {
    if (subjectBusy) return;
    if (subject.has_password && pickingSubject !== subject.id) {
      setPickingSubject(subject.id);
      setSubjectPassword("");
      return;
    }
    setSubjectBusy(true);
    try {
      const ok = await selectSubject(subject.id, subject.has_password ? subjectPassword : null);
      if (!ok) {
        toast.error("Incorrect password — could not select this subject");
        return;
      }
      setPickingSubject(null);
      setSubjectPassword("");
      await refresh();
      toast.success(`Subject set to ${subject.name}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not select subject");
    } finally {
      setSubjectBusy(false);
    }
  }

  async function save() {
    if (!user) return;
    const nextLast = lastName.trim().toUpperCase();
    const nextFirst = firstName.trim().toUpperCase();
    const nextMiddle = middleName.trim().toUpperCase();
    if (!nextLast || !nextFirst) {
      toast.error("Last name and first name are required");
      return;
    }
    setBusy(true);
    try {
      const name = buildFullName(nextLast, nextFirst, nextMiddle);
      const { error } = await supabase
        .from("profiles")
        .update({
          last_name: nextLast,
          first_name: nextFirst,
          middle_name: nextMiddle || null,
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
  const initials = getInitials({
    first_name: firstName,
    last_name: lastName,
    full_name: display?.full_name,
  });

  const selectedSubject = subjects.find((s) => s.id === display?.selected_subject_id) ?? null;

  return (
    <div className="max-w-md mx-auto px-5 pt-4 pb-8 md:max-w-3xl md:w-full md:px-0">
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
              {initials}
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

      <div className="mb-4 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center text-white shadow-soft shrink-0">
            <Coins className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-amber-800/70 dark:text-amber-200/70 font-semibold">
              Gotchi Coins
            </div>
            <div className="text-2xl font-extrabold text-amber-950 dark:text-amber-50 tabular-nums">
              {gcoinsLoading ? "…" : wallet.gcoins}
              <span className="text-sm font-semibold ml-1 opacity-70">GCoins</span>
            </div>
            <div className="text-[11px] text-amber-900/70 dark:text-amber-100/60 mt-0.5">
              Today {wallet.daily_earned}/{wallet.daily_cap} earned
            </div>
            <div className="text-[10px] text-amber-900/60 dark:text-amber-100/50 mt-1 leading-snug">
              Earn by chatting, wall posts, lessons, reviewers, activities &amp; feedback (daily cap applies).
            </div>
          </div>
          <Link
            to="/chat"
            search={{ tab: "store" }}
            className="shrink-0 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold shadow-soft"
          >
            Store
          </Link>
        </div>
      </div>

      <section className="mb-4 rounded-2xl bg-card border border-border p-4 shadow-card space-y-3">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">My subject</div>
            <div className="text-[10px] text-muted-foreground">
              Lessons, quizzes &amp; activities show only for your selected subject
            </div>
          </div>
        </div>
        {selectedSubject ? (
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 flex items-center gap-2">
            <span className="text-sm font-bold text-primary">{selectedSubject.name}</span>
            {selectedSubject.has_password && <Lock className="h-3 w-3 text-amber-600" />}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No subject selected yet — pick one below.</p>
        )}
        {subjects.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No subjects available yet.</p>
        ) : (
          <div className="space-y-2">
            {subjects.map((s) => {
              const isSelected = display?.selected_subject_id === s.id;
              const isPicking = pickingSubject === s.id;
              return (
                <div key={s.id} className="rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    disabled={subjectBusy || isSelected}
                    onClick={() => void pickSubject(s)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-emerald-500/10" : "hover:bg-muted/60"
                    } disabled:opacity-60`}
                  >
                    <div className="h-8 w-8 rounded-lg gradient-primary grid place-items-center text-primary-foreground text-xs font-bold shrink-0">
                      {s.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {s.has_password && <Lock className="h-3 w-3 text-amber-500" />}
                        {s.has_password ? "Password required" : "Open subject"}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                  </button>
                  {isPicking && s.has_password && (
                    <div className="px-3 pb-3 flex gap-2 border-t border-border pt-2">
                      <input
                        type="password"
                        value={subjectPassword}
                        onChange={(e) => setSubjectPassword(e.target.value)}
                        placeholder="Enter subject password"
                        className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
                        autoComplete="current-password"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void pickSubject(s);
                        }}
                      />
                      <button
                        type="button"
                        disabled={subjectBusy || !subjectPassword.trim()}
                        onClick={() => void pickSubject(s)}
                        className="px-3 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
                      >
                        {subjectBusy ? "…" : "Confirm"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="space-y-3 rounded-2xl bg-card border border-border p-4 shadow-card">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Last name</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value.toUpperCase())}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
            placeholder="LAST NAME"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value.toUpperCase())}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
            placeholder="FIRST NAME"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Middle name (optional)</span>
          <input
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value.toUpperCase())}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm uppercase outline-none focus:border-primary"
            placeholder="MIDDLE NAME"
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
      {user && <NotificationStatusCard userId={user.id} />}
      <Link
        to="/notifications"
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-card border border-border p-4 shadow-card hover:bg-muted/40"
      >
        <div>
          <div className="text-sm font-semibold">Notification preferences</div>
          <div className="text-[11px] text-muted-foreground">Categories, tester & debug panel</div>
        </div>
        <span className="text-primary text-sm">›</span>
      </Link>


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
