import { Link, useLocation } from "@tanstack/react-router";
import { MessageCircle, BookOpen, ClipboardList, Home, FolderKanban, Lightbulb, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnreadBadge, useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useGames } from "@/hooks/useGames";

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

export function BottomNav() {
  const { pathname } = useLocation();
  const { counts } = useUnreadBadges();
  const { openGames } = useGames();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom pb-2 px-2 pointer-events-none">
      <div
        className="glass-card pointer-events-auto mx-auto max-w-md overflow-x-auto overscroll-x-contain rounded-3xl scrollbar-none touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex w-max min-w-full items-center gap-0.5 px-1 py-1.5">
          {items.map(({ to, label, icon: Icon, exact, badgeKey }) => {
            const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
            const count = badgeKey ? counts[badgeKey] : 0;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative flex w-[4.75rem] min-w-[4.75rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl py-2 transition-all duration-200",
                  active ? "text-primary-foreground gradient-primary shadow-glow" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                  {!active && <UnreadBadge count={count} />}
                </span>
                <span className={cn("text-[10px] font-medium tracking-wide", active && "font-semibold")}>{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={openGames}
            className="relative flex w-[4.75rem] min-w-[4.75rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl py-2 text-muted-foreground transition-all duration-200 hover:text-foreground"
          >
            <Gamepad2 className="h-5 w-5" strokeWidth={2} />
            <span className="text-[10px] font-medium tracking-wide">Games</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
