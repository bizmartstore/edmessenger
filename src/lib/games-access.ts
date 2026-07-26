import { supabase } from "@/integrations/supabase/client";

const UNLOCK_KEY = "edmessenger_games_unlocked_v1";

export async function gamesPasswordRequired(): Promise<boolean> {
  const { data, error } = await supabase.rpc("games_password_required");
  if (error) throw error;
  return Boolean(data);
}

export async function unlockGames(password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("unlock_games", {
    p_password: password.trim() || null,
  });
  if (error) throw error;
  return Boolean(data);
}

/** Admin: set password, or pass empty/null to remove lock. Returns true if locked. */
export async function setGamesPassword(password: string | null): Promise<boolean> {
  const trimmed = password?.trim() || null;
  const { data, error } = await supabase.rpc("set_games_password", {
    p_password: trimmed,
  });
  if (error) throw error;
  return Boolean(data);
}

export function rememberGamesUnlock() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearGamesUnlock() {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function hasGamesUnlock(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}
