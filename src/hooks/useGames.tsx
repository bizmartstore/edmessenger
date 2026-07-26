import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { GameHubModal } from "@/components/games/GameHubModal";

type GamesCtx = {
  open: boolean;
  openGames: () => void;
  closeGames: () => void;
};

const Ctx = createContext<GamesCtx | null>(null);

export function GamesProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openGames = useCallback(() => setOpen(true), []);
  const closeGames = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openGames, closeGames }), [open, openGames, closeGames]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <GameHubModal open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

export function useGames() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGames must be used within GamesProvider");
  return ctx;
}
