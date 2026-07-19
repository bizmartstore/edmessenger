import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveTable =
  | "messages"
  | "direct_messages"
  | "announcements"
  | "activities"
  | "lessons"
  | "quizzes";

type LiveSpec = {
  table: LiveTable;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Supabase realtime filter, e.g. `published=eq.true` */
  filter?: string;
};

/**
 * Live UI refresh without polling.
 * - Subscribes to postgres_changes (Realtime websocket — not REST quota)
 * - Debounces reload so bursts of inserts only hit REST once
 * - One reconcile when the tab becomes visible again (missed events / reconnect)
 */
export function useLiveReload(
  channelName: string,
  tables: LiveSpec[],
  reload: () => void | Promise<void>,
  opts?: { enabled?: boolean; debounceMs?: number },
) {
  const enabled = opts?.enabled ?? true;
  const debounceMs = opts?.debounceMs ?? 600;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const tablesKey = tables
    .map((t) => `${t.table}:${t.event ?? "INSERT"}:${t.filter ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void reloadRef.current();
      }, debounceMs);
    };

    let ch = supabase.channel(channelName);
    for (const t of tables) {
      ch = ch.on(
        "postgres_changes",
        {
          event: t.event ?? "INSERT",
          schema: "public",
          table: t.table,
          ...(t.filter ? { filter: t.filter } : {}),
        },
        () => schedule(),
      );
    }
    ch.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
    // tablesKey captures table specs; reload uses a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled, debounceMs, tablesKey]);
}
