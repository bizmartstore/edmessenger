import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import { MessageCircle, BookOpen, ClipboardList, Home, FolderKanban, Lightbulb, Gamepad2, Store, BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnreadBadge, useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useAcademicModal } from "@/hooks/useAcademicModal";

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

export function BottomNav() {
  const { pathname } = useLocation();
  const { counts } = useUnreadBadges();
  const { openAcademic } = useAcademicModal();
  const search = useRouterState({
    select: (s) => (s.location.search ?? {}) as { tab?: string },
  });
  const onStore = pathname.startsWith("/chat") && search.tab === "store";
  const onChat = pathname.startsWith("/chat") && search.tab !== "store";

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom pb-2 px-2 pointer-events-none md:hidden">
      <div
        className="glass-card pointer-events-auto mx-auto max-w-md overflow-x-auto overscroll-x-contain rounded-3xl scrollbar-none touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex w-max min-w-full items-center gap-0.5 px-1 py-1.5">
          {items.map(({ to, id, label, icon: Icon, exact, badgeKey, kind }) => {
            let active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
            if (to === "/chat") active = onChat;
            const count = badgeKey ? counts[badgeKey] : 0;
            const className = cn(
              "relative flex w-[4.75rem] min-w-[4.75rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl py-2 transition-all duration-200",
              active ? "text-primary-foreground gradient-primary shadow-glow" : "text-muted-foreground hover:text-foreground",
            );

            if (kind === "action") {
              return (
                <button key={id} type="button" onClick={openAcademic} className={className}>
                  <span className="relative">
                    <Icon className="h-5 w-5 transition-transform" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-medium tracking-wide">{label}</span>
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
                <span className="relative">
                  <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                  {!active && <UnreadBadge count={count} />}
                </span>
                <span className={cn("text-[10px] font-medium tracking-wide", active && "font-semibold")}>{label}</span>
              </Link>
            );
          })}
          <Link
            to="/chat"
            search={{ tab: "store" }}
            className={cn(
              "relative flex w-[4.75rem] min-w-[4.75rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl py-2 transition-all duration-200",
              onStore
                ? "text-primary-foreground gradient-primary shadow-glow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Store className={cn("h-5 w-5", onStore && "scale-110")} strokeWidth={onStore ? 2.5 : 2} />
            <span className={cn("text-[10px] font-medium tracking-wide", onStore && "font-semibold")}>Store</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
