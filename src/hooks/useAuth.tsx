import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  getStoredAdminViewMode,
  isPrimaryAdminEmail,
  setStoredAdminViewMode,
  type AdminViewMode,
} from "@/lib/admin";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at?: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True when the signed-in account holds the admin role in DB */
  isAdmin: boolean;
  /** Primary admin email can preview the student UI without losing admin */
  viewMode: AdminViewMode;
  /** Effective admin access for routing/UI (false when viewing as user) */
  actingAsAdmin: boolean;
  canToggleAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setViewMode: (mode: AdminViewMode) => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewMode, setViewModeState] = useState<AdminViewMode>(() => getStoredAdminViewMode());
  const [loading, setLoading] = useState(true);

  const setViewMode = useCallback((mode: AdminViewMode) => {
    setStoredAdminViewMode(mode);
    setViewModeState(mode);
  }, []);

  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    let p = existing as Profile | null;
    if (!p) {
      const { data: inserted } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email ?? null,
        full_name: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? null,
        avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
      }).select().single();
      p = inserted as Profile | null;
    }
    setProfile(p);

    // Primary admin: ensure role without passcode (ignore if SQL not migrated yet)
    if (isPrimaryAdminEmail(user.email)) {
      await supabase.rpc("ensure_primary_admin");
    }

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(Boolean(role) || isPrimaryAdminEmail(user.email));
    // If primary admin email, always treat as admin for UI even before RPC succeeds
    if (isPrimaryAdminEmail(user.email)) setIsAdmin(true);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session?.user ?? null);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      loadProfile(data.session?.user ?? null).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      loadProfile(s?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Lightweight keep-alive while the app tab is open (prevents Supabase free-tier pause)
  useEffect(() => {
    if (!session) return;
    const ping = () => {
      fetch("/api/keepalive", { cache: "no-store" }).catch(() => {});
      navigator.serviceWorker?.controller?.postMessage({ type: "KEEPALIVE" });
    };
    ping();
    const id = window.setInterval(ping, 4 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  }, []);

  const canToggleAdmin = isPrimaryAdminEmail(session?.user?.email);
  const effectiveIsAdmin = isAdmin || canToggleAdmin;
  const actingAsAdmin = effectiveIsAdmin && (!canToggleAdmin || viewMode === "admin");

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        isAdmin: effectiveIsAdmin,
        viewMode,
        actingAsAdmin,
        canToggleAdmin,
        loading,
        refresh,
        signOut,
        setViewMode,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
