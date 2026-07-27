import { useCallback, useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  emptyWallet,
  fetchGcoinWallet,
  type CosmeticsState,
  type GcoinWallet,
} from "@/lib/gcoins";

interface GcoinCtx {
  wallet: GcoinWallet;
  loading: boolean;
  refresh: () => Promise<void>;
  setBalance: (n: number) => void;
  setCosmetics: (c: CosmeticsState) => void;
}

const Ctx = createContext<GcoinCtx | null>(null);

export function GcoinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<GcoinWallet>(emptyWallet);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setWallet(emptyWallet());
      return;
    }
    setLoading(true);
    try {
      setWallet(await fetchGcoinWallet());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setBalance = useCallback((n: number) => {
    setWallet((w) => ({ ...w, gcoins: Math.max(0, n) }));
  }, []);

  const setCosmetics = useCallback((c: CosmeticsState) => {
    setWallet((w) => ({ ...w, cosmetics: c }));
  }, []);

  return (
    <Ctx.Provider value={{ wallet, loading, refresh, setBalance, setCosmetics }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGcoins() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGcoins must be used within GcoinProvider");
  return ctx;
}
