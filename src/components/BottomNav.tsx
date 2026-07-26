import { Link, useLocation } from "@tanstack/react-router";
import { MessageCircle, BookOpen, ClipboardList, Home, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnreadBadge, useUnreadBadges } from "@/hooks/useUnreadBadges";

type BadgeKey = "announcements" | "chat" | "activities" | "lessons" | "quizzes";

const items: {
  to: "/" | "/chat" | "/activities" | "/lessons" | "/quizzes";
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
];

export function BottomNav() {
  const { pathname } = useLocation();
  const { counts } = useUnreadBadges();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom pb-2 px-3 pointer-events-none">
      <div className="glass-card pointer-events-auto max-w-md mx-auto rounded-3xl px-1 py-2 flex items-center justify-between">
        {items.map(({ to, label, icon: Icon, exact, badgeKey }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          const count = badgeKey ? counts[badgeKey] : 0;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all duration-200",
                active ? "text-primary-foreground gradient-primary shadow-glow" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                {!active && <UnreadBadge count={count} />}
              </span>
              <span className={cn("text-[9px] font-medium tracking-wide", active && "font-semibold")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
