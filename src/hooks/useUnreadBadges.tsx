import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export type UnreadSection = "classroom" | "dms" | "activities" | "lessons" | "quizzes" | "announcements";

export interface UnreadCounts {
  classroom: number;
  dms: number;
  chat: number;
  activities: number;
  lessons: number;
  quizzes: number;
  announcements: number;
}

const EMPTY: UnreadCounts = {
  classroom: 0,
  dms: 0,
  chat: 0,
  activities: 0,
  lessons: 0,
  quizzes: 0,
  announcements: 0,
};

interface UnreadCtx {
  counts: UnreadCounts;
  refresh: () => Promise<void>;
  markRead: (section: UnreadSection) => Promise<void>;
}

const Ctx = createContext<UnreadCtx | null>(null);

/** Debounce window so chat bursts don't spam get_unread_counts RPC. */
const REFRESH_DEBOUNCE_MS = 2500;

export function UnreadBadgesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCounts(EMPTY);
      return;
    }
    const { data, error } = await supabase.rpc("get_unread_counts");
    if (error || !data) {
      setCounts(EMPTY);
      return;
    }
    const raw = data as Record<string, number>;
    setCounts({
      classroom: Number(raw.classroom ?? 0),
      dms: Number(raw.dms ?? 0),
      chat: Number(raw.chat ?? 0),
      activities: Number(raw.activities ?? 0),
      lessons: Number(raw.lessons ?? 0),
      quizzes: Number(raw.quizzes ?? 0),
      announcements: Number(raw.announcements ?? 0),
    });
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

  // Realtime signals only — debounced RPC (not per-message REST)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lessons" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, scheduleRefresh)
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [user, scheduleRefresh]);

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
