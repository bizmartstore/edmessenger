/** Gotchi Coins (GCoins) — server-awarded via RPCs with daily caps. */

import { supabase } from "@/integrations/supabase/client";

export type GcoinAction =
  | "classroom_message"
  | "dm_message"
  | "group_message"
  | "wall_post"
  | "feedback"
  | "complete_activity"
  | "complete_reviewer"
  | "view_lesson"
  | "download_lesson";

export type ChatSurface = "classroom" | "dm" | "group" | "wall";

export interface CosmeticsState {
  owned_items: string[];
  active_bubble: string;
  bg_classroom: string | null;
  bg_dm: string | null;
  bg_group: string | null;
  bg_wall: string | null;
}

export interface GcoinWallet {
  gcoins: number;
  daily_earned: number;
  daily_cap: number;
  cosmetics: CosmeticsState;
  rewards: Record<string, { amount: number; daily_action_cap: number }>;
}

export interface AwardResult {
  ok: boolean;
  awarded: number;
  balance: number;
  daily_earned?: number;
  daily_cap?: number;
  reason?: string;
}

export const GCOIN_ACTION_LABELS: Record<GcoinAction, string> = {
  classroom_message: "Classroom message",
  dm_message: "Private message",
  group_message: "Group message",
  wall_post: "Class wall post",
  feedback: "Sending feedback",
  complete_activity: "Completing activity",
  complete_reviewer: "Finishing reviewer",
  view_lesson: "Reading a lesson",
  download_lesson: "Downloading a lesson",
};

const DEFAULT_COSMETICS: CosmeticsState = {
  owned_items: ["bubble_classic"],
  active_bubble: "bubble_classic",
  bg_classroom: null,
  bg_dm: null,
  bg_group: null,
  bg_wall: null,
};

function parseCosmetics(raw: unknown): CosmeticsState {
  const c = (raw ?? {}) as Partial<CosmeticsState> & { owned_items?: unknown };
  const owned = Array.isArray(c.owned_items)
    ? c.owned_items.map(String)
    : DEFAULT_COSMETICS.owned_items;
  return {
    owned_items: owned.length ? owned : DEFAULT_COSMETICS.owned_items,
    active_bubble: String(c.active_bubble || "bubble_classic"),
    bg_classroom: c.bg_classroom ? String(c.bg_classroom) : null,
    bg_dm: c.bg_dm ? String(c.bg_dm) : null,
    bg_group: c.bg_group ? String(c.bg_group) : null,
    bg_wall: c.bg_wall ? String(c.bg_wall) : null,
  };
}

export function emptyWallet(): GcoinWallet {
  return {
    gcoins: 0,
    daily_earned: 0,
    daily_cap: 50,
    cosmetics: { ...DEFAULT_COSMETICS },
    rewards: {},
  };
}

export async function fetchGcoinWallet(): Promise<GcoinWallet> {
  const { data, error } = await supabase.rpc("get_my_gcoin_wallet");
  if (error || !data) return emptyWallet();
  const raw = data as Record<string, unknown>;
  return {
    gcoins: Math.max(0, Number(raw.gcoins) || 0),
    daily_earned: Math.max(0, Number(raw.daily_earned) || 0),
    daily_cap: Math.max(1, Number(raw.daily_cap) || 50),
    cosmetics: parseCosmetics(raw.cosmetics),
    rewards: (raw.rewards as GcoinWallet["rewards"]) ?? {},
  };
}

export async function awardGcoinsAsync(
  action: GcoinAction,
  claimKey?: string | null,
): Promise<AwardResult> {
  try {
    const { data, error } = await supabase.rpc("award_gcoins", {
      p_action: action,
      p_claim_key: claimKey ?? null,
    });
    if (error) {
      const msg = error.message || "award failed";
      if (/award_gcoins|does not exist|schema cache/i.test(msg)) {
        return { ok: false, awarded: 0, balance: 0, reason: "not_migrated" };
      }
      return { ok: false, awarded: 0, balance: 0, reason: msg };
    }
    const raw = (data ?? {}) as Record<string, unknown>;
    return {
      ok: Boolean(raw.ok),
      awarded: Math.max(0, Number(raw.awarded) || 0),
      balance: Math.max(0, Number(raw.balance) || 0),
      daily_earned: Number(raw.daily_earned) || undefined,
      daily_cap: Number(raw.daily_cap) || undefined,
      reason: raw.reason ? String(raw.reason) : undefined,
    };
  } catch {
    return { ok: false, awarded: 0, balance: 0, reason: "network" };
  }
}

/** @deprecated Prefer useGcoins().earn — kept for rare non-React call sites. */
export function awardGcoins(action: GcoinAction, claimKey?: string | null): void {
  if (typeof window === "undefined") return;
  void awardGcoinsAsync(action, claimKey);
}

export async function purchaseStoreItem(itemId: string): Promise<{
  ok: boolean;
  reason?: string;
  balance?: number;
  cosmetics?: CosmeticsState;
}> {
  const { data, error } = await supabase.rpc("purchase_store_item", { p_item_id: itemId });
  if (error) return { ok: false, reason: error.message };
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(raw.ok),
    reason: raw.reason ? String(raw.reason) : undefined,
    balance: raw.balance != null ? Number(raw.balance) : undefined,
    cosmetics: raw.cosmetics ? parseCosmetics(raw.cosmetics) : undefined,
  };
}

export async function setActiveBubble(itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_active_bubble", { p_item_id: itemId });
  if (error) return false;
  return Boolean((data as { ok?: boolean } | null)?.ok);
}

export async function setChatBackground(
  surface: ChatSurface,
  value: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("set_chat_background", {
    p_surface: surface,
    p_value: value,
  });
  if (error) return { ok: false, reason: error.message };
  const raw = (data ?? {}) as { ok?: boolean; reason?: string };
  return { ok: Boolean(raw.ok), reason: raw.reason };
}

export function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
