import { Link, useLocation } from "@tanstack/react-router";
import { MessageCircle, BookOpen, ClipboardList, Home, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/activities", label: "Activity", icon: FolderKanban },
  { to: "/lessons", label: "Lessons", icon: BookOpen },
  { to: "/quizzes", label: "Quizzes", icon: ClipboardList },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom pb-2 px-3 pointer-events-none">
      <div className="glass-card pointer-events-auto max-w-md mx-auto rounded-3xl px-1 py-2 flex items-center justify-between">
        {items.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all duration-200",
                active ? "text-primary-foreground gradient-primary shadow-glow" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
              <span className={cn("text-[9px] font-medium tracking-wide", active && "font-semibold")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
