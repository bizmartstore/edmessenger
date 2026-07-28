import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import {
  MessageCircle,
  BookOpen,
  ClipboardList,
  Home,
  FolderKanban,
  Lightbulb,
  Gamepad2,
  UserRound,
  Store,
  BookOpenCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useAuth } from "@/hooks/useAuth";
import { useAcademicModal } from "@/hooks/useAcademicModal";
import { getFirstName } from "@/lib/profile-name";

type BadgeKey = "announcements" | "chat" | "activities" | "lessons" | "quizzes";

const items: {
  to?: "/" | "/chat" | "/activities" | "/lessons" | "/quizzes" | "/feedback" | "/games";
  id: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  badgeKey: BadgeKey | null;
  kind: "link" | "action";
}[] = [
  { id: "home", to: "/", label: "Home", icon: Home, exact: true, badgeKey: "announcements", kind: "link" },
  { id: "chat", to: "/chat", label: "Chat", icon: MessageCircle, badgeKey: "chat", kind: "link" },
  { id: "activities", to: "/activities", label: "Activity", icon: FolderKanban, badgeKey: "activities", kind: "link" },
  { id: "lessons", to: "/lessons", label: "Lessons", icon: BookOpen, badgeKey: "lessons", kind: "link" },
  { id: "quizzes", to: "/quizzes", label: "Quizzes", icon: ClipboardList, badgeKey: "quizzes", kind: "link" },
  { id: "academic", label: "Academic", icon: BookOpenCheck, badgeKey: null, kind: "action" },
  { id: "feedback", to: "/feedback", label: "Feedback", icon: Lightbulb, badgeKey: null, kind: "link" },
  { id: "games", to: "/games", label: "Games", icon: Gamepad2, badgeKey: null, kind: "link" },
];

/** Desktop-only left navigation. Hidden below md so mobile layout stays unchanged. */
export function DesktopSidebar() {
  const { pathname } = useLocation();
  const { counts } = useUnreadBadges();
  const { profile } = useAuth();
  const { openAcademic } = useAcademicModal();
  const search = useRouterState({
    select: (s) => (s.location.search ?? {}) as { tab?: string },
  });
  const onStore = pathname.startsWith("/chat") && search.tab === "store";
  const onChat = pathname.startsWith("/chat") && search.tab !== "store";

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
        {items.map(({ to, id, label, icon: Icon, exact, badgeKey, kind }) => {
          let active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          if (to === "/chat") active = onChat;
          const count = badgeKey ? counts[badgeKey] : 0;
          const className = cn(
            "relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
            active
              ? "gradient-primary text-primary-foreground shadow-glow"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          );
          if (kind === "action") {
            return (
              <button key={id} type="button" onClick={openAcademic} className={className}>
                <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                <span className="flex-1 truncate text-left">{label}</span>
              </button>
            );
          }
          return (
            <Link
              key={to}
              to={to!}
              search={to === "/chat" ? {} : undefined}
              className={className}
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

        <Link
          to="/chat"
          search={{ tab: "store" }}
          className={cn(
            "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
            onStore
              ? "gradient-primary text-primary-foreground shadow-glow"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Store className="h-5 w-5 shrink-0" strokeWidth={onStore ? 2.5 : 2} />
          <span className="flex-1 text-left truncate">Store</span>
        </Link>
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
          <span className="min-w-0 flex-1 truncate">{getFirstName(profile ?? {}) || "Profile"}</span>
        </Link>
      </div>
    </aside>
  );
}
