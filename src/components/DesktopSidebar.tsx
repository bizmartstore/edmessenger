import { Link, useLocation } from "@tanstack/react-router";
import {
  MessageCircle,
  BookOpen,
  ClipboardList,
  Home,
  FolderKanban,
  Lightbulb,
  Gamepad2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useGames } from "@/hooks/useGames";
import { useAuth } from "@/hooks/useAuth";

type BadgeKey = "announcements" | "chat" | "activities" | "lessons" | "quizzes";

const items: {
  to: "/" | "/chat" | "/activities" | "/lessons" | "/quizzes" | "/feedback";
  label: string;
  icon: typeof Home;
  exact?: boolean;
  badgeKey: BadgeKey | null;
}[] = [
  { to: "/", label: "Home", icon: Home, exact: true, badgeKey: "announcements" },
  { to: "/chat", label: "Chat", icon: MessageCircle, badgeKey: "chat" },
  { to: "/activities", label: "Activity", icon: FolderKanban, badgeKey: "activities" },
  { to: "/lessons", label: "Lessons", icon: BookOpen, badgeKey: "lessons" },
  { to: "/quizzes", label: "Quizzes", icon: ClipboardList, badgeKey: "quizzes" },
  { to: "/feedback", label: "Feedback", icon: Lightbulb, badgeKey: null },
];

/** Desktop-only left navigation. Hidden below md so mobile layout stays unchanged. */
export function DesktopSidebar() {
  const { pathname } = useLocation();
  const { counts } = useUnreadBadges();
  const { openGames } = useGames();
  const { profile } = useAuth();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card/80 backdrop-blur-sm safe-top">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <img
          src="/logo.png?v=3"
          alt="EdMessenger"
          className="h-10 w-10 rounded-xl object-contain bg-white p-0.5 shadow-card"
        />
        <div className="min-w-0">
          <div className="font-bold text-sm tracking-tight truncate">EdMessenger</div>
          <div className="text-[11px] text-muted-foreground truncate">Classroom</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map(({ to, label, icon: Icon, exact, badgeKey }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          const count = badgeKey ? counts[badgeKey] : 0;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              <span className="flex-1 truncate">{label}</span>
              {!active && count > 0 ? (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center leading-none">
                  {count > 9 ? "9+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={openGames}
          className="relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
        >
          <Gamepad2 className="h-5 w-5 shrink-0" strokeWidth={2} />
          <span className="flex-1 text-left truncate">Games</span>
        </button>
      </nav>

      <div className="border-t border-border p-3">
        <Link
          to="/profile"
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
            pathname === "/profile" || pathname.startsWith("/profile/")
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-8 w-8 rounded-xl object-cover ring-1 ring-border"
            />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-muted">
              <UserRound className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{profile?.full_name?.split(" ")[0] || "Profile"}</span>
        </Link>
      </div>
    </aside>
  );
}
