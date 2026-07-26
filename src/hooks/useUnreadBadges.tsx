import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearAppBadge, syncAppBadge, totalUnread } from "@/lib/app-badge";
import { cn } from "@/lib/utils";

export type UnreadSection =
  | "classroom"
  | "dms"
  | "groups"
  | "activities"
  | "lessons"
  | "quizzes"
  | "announcements"
  | "wall";

export interface UnreadCounts {
  classroom: number;
  dms: number;
  groups: number;
  chat: number;
  activities: number;
  lessons: number;
  quizzes: number;
  announcements: number;
  wall: number;
  total: number;
}

const EMPTY: UnreadCounts = {
  classroom: 0,
  dms: 0,
  groups: 0,
  chat: 0,
  activities: 0,
  lessons: 0,
  quizzes: 0,
  announcements: 0,
  wall: 0,
  total: 0,
};

interface UnreadCtx {
  counts: UnreadCounts;
  refresh: () => Promise<void>;
  markRead: (section: UnreadSection) => Promise<void>;
}

const Ctx = createContext<UnreadCtx | null>(null);

/** Debounce window so chat bursts don't spam get_unread_counts RPC. */
const REFRESH_DEBOUNCE_MS = 2500;

function normalizeCounts(raw: Record<string, number>): UnreadCounts {
  const classroom = Number(raw.classroom ?? 0);
  const dms = Number(raw.dms ?? 0);
  const groups = Number(raw.groups ?? 0);
  const chat = Number(raw.chat ?? classroom + dms + groups);
  const activities = Number(raw.activities ?? 0);
  const lessons = Number(raw.lessons ?? 0);
  const quizzes = Number(raw.quizzes ?? 0);
  const announcements = Number(raw.announcements ?? 0);
  const wall = Number(raw.wall ?? 0);
  const computed = totalUnread({ chat, activities, lessons, quizzes, announcements }) + wall;
  const total = Number(raw.total ?? computed);
  return {
    classroom,
    dms,
    groups,
    chat,
    activities,
    lessons,
    quizzes,
    announcements,
    wall,
    total: total || computed,
  };
}

export function UnreadBadgesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCounts(EMPTY);
      void clearAppBadge();
      return;
    }
    const { data, error } = await supabase.rpc("get_unread_counts");
    if (error || !data) {
      setCounts(EMPTY);
      return;
    }
    const next = normalizeCounts(data as Record<string, number>);
    setCounts(next);
    void syncAppBadge(next.total);
  }, [user]);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  const markRead = useCallback(
    async (section: UnreadSection) => {
      if (!user) return;
      await supabase.rpc("mark_section_read", { sec: section });
      // Immediate for the section the user just opened
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await refresh();
    },
    [user, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep badge accurate when returning to the app / receiving a push while backgrounded
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const onFocus = () => scheduleRefresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, scheduleRefresh]);

  // Realtime signals only — debounced RPC (not per-message REST)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wall_posts" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lessons" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviewers" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [user, scheduleRefresh]);

  // Clear badge on logout
  useEffect(() => {
    if (!user) void clearAppBadge();
  }, [user]);

  return <Ctx.Provider value={{ counts, refresh, markRead }}>{children}</Ctx.Provider>;
}

export function useUnreadBadges() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUnreadBadges must be used within UnreadBadgesProvider");
  return ctx;
}

/** Red count pill — shows 9+ when over 9 */
export function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count || count < 1) return null;
  return (
    <span
      className={cn(
        "absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center leading-none shadow z-10",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
