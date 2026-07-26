import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OnlineUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface PresenceCtx {
  online: OnlineUser[];
  onlineIds: Set<string>;
  isOnline: (userId: string) => boolean;
}

const Ctx = createContext<PresenceCtx>({
  online: [],
  onlineIds: new Set(),
  isOnline: () => false,
});

type PresenceMeta = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

/** Global Realtime Presence — no DB writes, no storage quota. */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [online, setOnline] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!user) {
      setOnline([]);
      return;
    }

    const channel = supabase.channel("edm-presence", {
      config: { presence: { key: user.id } },
    });

    const sync = () => {
      const state = channel.presenceState<PresenceMeta>();
      const map = new Map<string, OnlineUser>();
      for (const key of Object.keys(state)) {
        const rows = state[key];
        const meta = rows?.[0];
        if (!meta?.id || meta.id === user.id) continue;
        map.set(meta.id, {
          id: meta.id,
          full_name: meta.full_name ?? null,
          avatar_url: meta.avatar_url ?? null,
        });
      }
      setOnline([...map.values()].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            id: user.id,
            full_name: profile?.full_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
          } satisfies PresenceMeta);
        }
      });

    return () => {
      void channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [user, profile?.full_name, profile?.avatar_url]);

  const value = useMemo<PresenceCtx>(() => {
    const onlineIds = new Set(online.map((u) => u.id));
    return {
      online,
      onlineIds,
      isOnline: (id: string) => onlineIds.has(id),
    };
  }, [online]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePresence() {
  return useContext(Ctx);
}
