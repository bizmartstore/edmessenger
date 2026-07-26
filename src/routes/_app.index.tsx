import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageCircle,
  BookOpen,
  ClipboardList,
  LogOut,
  Shield,
  UserRound,
  Megaphone,
  FolderKanban,
  Lightbulb,
  type LucideProps,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BannerCarousel } from "@/components/BannerCarousel";
import { PostWall } from "@/components/PostWall";
import { UnreadBadge, useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useLiveReload } from "@/hooks/useLiveReload";
import { useAutoHorizontalScroll } from "@/hooks/useAutoHorizontalScroll";

type HomeTile = {
  to: "/chat" | "/activities" | "/lessons" | "/quizzes" | "/feedback";
  icon: ComponentType<LucideProps>;
  label: string;
  color: string;
  badge: number;
};

function HomeActionCarousel({ tiles }: { tiles: readonly HomeTile[] }) {
  const scroll = useAutoHorizontalScroll(true, 0.35);
  // Duplicate for seamless loop while auto-scrolling
  const loop = [...tiles, ...tiles];

  return (
    <div
      ref={scroll.ref}
      onPointerDown={scroll.onPointerDown}
      onTouchStart={scroll.onTouchStart}
      onWheel={scroll.onWheel}
      className="mt-4 flex gap-2.5 overflow-x-auto overscroll-x-contain scrollbar-none touch-pan-x pb-0.5"
      style={{ WebkitOverflowScrolling: "touch" }}
      aria-label="Quick actions"
    >
      {loop.map((t, i) => (
        <Link
          key={`${t.to}-${i}`}
          to={t.to}
          className="group relative flex w-[5.5rem] min-w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-1 py-3 shadow-card transition-all hover:shadow-glow active:scale-95"
        >
          <UnreadBadge count={t.badge} className="top-1 right-1 -translate-y-0 translate-x-0" />
          <div
            className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${t.color} shadow-soft transition-transform group-hover:scale-110`}
          >
            <t.icon className="h-[18px] w-[18px] text-white" />
          </div>
          <span className="text-center text-[10px] font-semibold leading-tight text-foreground/90">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/_app/")({
  component: Home,
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

function Home() {
  const { profile, signOut, canToggleAdmin, viewMode, setViewMode, isAdmin, actingAsAdmin } = useAuth();
  const { counts, markRead } = useUnreadBadges();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const loadHome = useCallback(async () => {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!error) setAnnouncements((data ?? []) as Announcement[]);
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useLiveReload(
    "home-live",
    [
      { table: "announcements", event: "INSERT" },
      { table: "lessons", event: "INSERT" },
      { table: "activities", event: "INSERT" },
      { table: "quizzes", event: "*" },
    ],
    loadHome,
    { debounceMs: 800 },
  );

  useEffect(() => {
    const t = window.setTimeout(() => void markRead("announcements"), 2000);
    return () => window.clearTimeout(t);
  }, [markRead]);

  const first = (profile?.full_name ?? "").split(" ")[0] || "friend";

  const tiles = [
    {
      to: "/chat",
      icon: MessageCircle,
      label: "Chat",
      color: "from-violet-500 to-fuchsia-500",
      badge: counts.chat,
    },
    {
      to: "/activities",
      icon: FolderKanban,
      label: "Activities",
      color: "from-sky-400 to-blue-600",
      badge: counts.activities,
    },
    {
      to: "/lessons",
      icon: BookOpen,
      label: "Lessons",
      color: "from-amber-400 to-orange-500",
      badge: counts.lessons,
    },
    {
      to: "/quizzes",
      icon: ClipboardList,
      label: "Quizzes",
      color: "from-emerald-400 to-teal-500",
      badge: counts.quizzes,
    },
    {
      to: "/feedback",
      icon: Lightbulb,
      label: "Feedback",
      color: "from-rose-400 to-pink-600",
      badge: 0,
    },
  ] satisfies readonly HomeTile[];

  return (
    <div className="px-4 pt-6 max-w-md mx-auto pb-4">
      <header className="flex items-center gap-3 px-1">
        <Link to="/profile" className="relative shrink-0">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-12 w-12 rounded-2xl object-cover shadow-card ring-2 ring-primary/20"
            />
          ) : (
            <img src="/logo.png?v=3" alt="EdMessenger" className="h-12 w-12 rounded-2xl object-contain bg-white p-0.5 shadow-card" />
          )}
        </Link>
        <Link to="/profile" className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Welcome back</div>
          <div className="font-bold truncate">{first}</div>
          <div className="text-[10px] text-primary font-medium">View account →</div>
        </Link>
        {(canToggleAdmin || isAdmin) && (
          <button
            type="button"
            onClick={() => {
              if (canToggleAdmin) {
                setViewMode("admin");
              }
              navigate({ to: "/admin" });
            }}
            className="p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
            title="Admin dashboard"
          >
            <Shield className="h-4 w-4 text-primary" />
          </button>
        )}
        <button onClick={signOut} className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors" title="Sign out">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </button>
      </header>

      {canToggleAdmin && (
        <div className="mt-3 flex rounded-2xl bg-muted p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode("user")}
            className={`flex-1 py-2 rounded-xl transition-all inline-flex items-center justify-center gap-1 ${viewMode === "user" ? "bg-card shadow-card text-foreground" : "text-muted-foreground"}`}
          >
            <UserRound className="h-3.5 w-3.5" /> Student
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("admin");
              navigate({ to: "/admin" });
            }}
            className={`flex-1 py-2 rounded-xl transition-all inline-flex items-center justify-center gap-1 ${viewMode === "admin" || actingAsAdmin ? "gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground"}`}
          >
            <Shield className="h-3.5 w-3.5" /> Admin
          </button>
        </div>
      )}

      <BannerCarousel />

      <div className="mt-5 rounded-3xl gradient-hero p-5 text-white shadow-glow overflow-hidden relative">
        <Megaphone className="absolute -top-1 -right-1 h-20 w-20 text-white/10" />
        {counts.announcements > 0 && (
          <span className="absolute top-3 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
            {counts.announcements > 9 ? "9+" : counts.announcements}
          </span>
        )}
        <div className="text-xs uppercase tracking-widest opacity-80">Announcements</div>
        {announcements.length === 0 ? (
          <>
            <div className="mt-1 text-xl font-extrabold leading-tight">No announcements yet</div>
            <div className="mt-1 text-sm opacity-90">
              {isAdmin ? "Post one from Admin → Announcements." : "Check back soon for updates from your teacher."}
            </div>
          </>
        ) : (
          <div className="mt-2 space-y-3">
            {announcements.slice(0, 2).map((a) => (
              <div key={a.id}>
                <div className="font-extrabold text-lg leading-tight">{a.title}</div>
                <div className="text-sm opacity-90 line-clamp-2 mt-0.5">{a.body}</div>
                <div className="text-[10px] opacity-70 mt-1">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <HomeActionCarousel tiles={tiles} />

      <PostWall />
    </div>
  );
}
