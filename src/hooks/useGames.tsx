import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

type GamesCtx = {
  open: boolean;
  openGames: () => void;
  closeGames: () => void;
};

const Ctx = createContext<GamesCtx | null>(null);

/** Navigates to the full-page Games tab (same pattern as Feedback). */
export function GamesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const openGames = useCallback(() => {
    void navigate({ to: "/games" });
  }, [navigate]);
  const closeGames = useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);
  const value = useMemo(
    () => ({ open: false, openGames, closeGames }),
    [openGames, closeGames],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGames() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGames must be used within GamesProvider");
  return ctx;
}
