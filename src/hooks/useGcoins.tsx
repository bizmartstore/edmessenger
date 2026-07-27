import { useCallback, useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  awardGcoinsAsync,
  emptyWallet,
  fetchGcoinWallet,
  GCOIN_ACTION_LABELS,
  type AwardResult,
  type CosmeticsState,
  type GcoinAction,
  type GcoinWallet,
} from "@/lib/gcoins";

interface GcoinCtx {
  wallet: GcoinWallet;
  loading: boolean;
  refresh: () => Promise<void>;
  setBalance: (n: number) => void;
  setCosmetics: (c: CosmeticsState) => void;
  /** Award GCoins, update balance, and toast when coins are earned. */
  earn: (
    action: GcoinAction,
    claimKey?: string | null,
    opts?: { explainZero?: boolean },
  ) => Promise<AwardResult>;
}

const Ctx = createContext<GcoinCtx | null>(null);

export function GcoinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<GcoinWallet>(emptyWallet);
  const [loading, setLoading] = useState(false);
  const warnedMigration = useRef(false);

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

  const earn = useCallback(
    async (action: GcoinAction, claimKey?: string | null, opts?: { explainZero?: boolean }) => {
      if (!user) {
        return { ok: false, awarded: 0, balance: 0, reason: "auth" };
      }
      const res = await awardGcoinsAsync(action, claimKey);

      if (res.reason === "not_migrated") {
        if (!warnedMigration.current) {
          warnedMigration.current = true;
          toast.error("GCoins not ready", {
            description: "Ask admin to run SUPABASE_MIGRATION_GCOINS_STORE.sql",
          });
        }
        return res;
      }

      if (res.ok && res.awarded > 0) {
        setWallet((w) => ({
          ...w,
          gcoins: res.balance,
          daily_earned: res.daily_earned ?? w.daily_earned + res.awarded,
          daily_cap: res.daily_cap ?? w.daily_cap,
        }));
        toast.success(`+${res.awarded} GCoins`, {
          description: GCOIN_ACTION_LABELS[action],
        });
        return res;
      }

      // Sync balance even when 0 awarded
      if (res.ok && typeof res.balance === "number") {
        setWallet((w) => ({
          ...w,
          gcoins: res.balance,
          daily_earned: res.daily_earned ?? w.daily_earned,
          daily_cap: res.daily_cap ?? w.daily_cap,
        }));
      }

      if (opts?.explainZero) {
        if (res.reason === "already_claimed") {
          toast.message("Already earned", {
            description: `You already got GCoins for this ${GCOIN_ACTION_LABELS[action].toLowerCase()}.`,
          });
        } else if (res.reason === "action_cap") {
          toast.message("Daily action limit", {
            description: `You've reached today's limit for ${GCOIN_ACTION_LABELS[action].toLowerCase()}.`,
          });
        } else if (res.reason === "daily_cap") {
          toast.message("Daily max reached", {
            description: `You've earned today's max GCoins (${res.daily_cap ?? 50}).`,
          });
        } else if (!res.ok && res.reason) {
          toast.error("Could not award GCoins", { description: res.reason });
        }
      }

      return res;
    },
    [user],
  );

  return (
    <Ctx.Provider value={{ wallet, loading, refresh, setBalance, setCosmetics, earn }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGcoins() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGcoins must be used within GcoinProvider");
  return ctx;
}
