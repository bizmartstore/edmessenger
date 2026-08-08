/** Escape-room powerups — bought with GCoins, consumed server-side. */

import { supabase } from "@/integrations/supabase/client";

export type PowerupId =
  | "pw_time_freeze"
  | "pw_xray"
  | "pw_skeleton_key"
  | "pw_shield"
  | "pw_lucky_charm"
  | "pw_reveal_letters";

export interface Powerup {
  id: PowerupId;
  name: string;
  emoji: string;
  description: string;
  price: number;
}

export const POWERUPS: Powerup[] = [
  {
    id: "pw_time_freeze",
    name: "Time Freeze",
    emoji: "⏳",
    description: "Freezes the clock for 45 seconds.",
    price: 30,
  },
  {
    id: "pw_xray",
    name: "X-Ray Vision",
    emoji: "🔮",
    description: "Reveals this lock's hint with no point penalty.",
    price: 25,
  },
  {
    id: "pw_reveal_letters",
    name: "Letter Peek",
    emoji: "🔤",
    description: "Shows the first two letters of the answer.",
    price: 20,
  },
  {
    id: "pw_shield",
    name: "Miss Shield",
    emoji: "🛡️",
    description: "Absorbs your next 3 wrong answers.",
    price: 35,
  },
  {
    id: "pw_skeleton_key",
    name: "Skeleton Key",
    emoji: "🗝️",
    description: "Instantly opens the current lock (−3 pts).",
    price: 60,
  },
  {
    id: "pw_lucky_charm",
    name: "Lucky Charm",
    emoji: "🍀",
    description: "+3 bonus points when you escape.",
    price: 50,
  },
];

export const POWERUP_BY_ID: Record<string, Powerup> = Object.fromEntries(
  POWERUPS.map((p) => [p.id, p]),
);

export type PowerupInventory = Record<string, number>;

function parseInventory(raw: unknown): PowerupInventory {
  const out: PowerupInventory = {};
  const obj = (raw ?? {}) as Record<string, unknown>;
  for (const p of POWERUPS) out[p.id] = Math.max(0, Number(obj[p.id]) || 0);
  return out;
}

export function emptyInventory(): PowerupInventory {
  return parseInventory({});
}

export async function fetchPowerups(): Promise<{
  inventory: PowerupInventory;
  migrated: boolean;
}> {
  const { data, error } = await supabase.rpc("get_my_powerups");
  if (error) return { inventory: emptyInventory(), migrated: false };
  return { inventory: parseInventory(data), migrated: true };
}

export interface PowerupBuyResult {
  ok: boolean;
  reason?: string;
  balance?: number;
  inventory?: PowerupInventory;
}

export async function buyPowerup(id: PowerupId, qty = 1): Promise<PowerupBuyResult> {
  const { data, error } = await supabase.rpc("buy_powerup", { p_item_id: id, p_qty: qty });
  if (error) {
    const msg = error.message || "purchase failed";
    if (/buy_powerup|does not exist|schema cache/i.test(msg)) {
      return { ok: false, reason: "not_migrated" };
    }
    return { ok: false, reason: msg };
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(raw.ok),
    reason: raw.reason ? String(raw.reason) : undefined,
    balance: raw.balance != null ? Number(raw.balance) : undefined,
    inventory: raw.inventory ? parseInventory(raw.inventory) : undefined,
  };
}

export async function consumePowerup(
  id: PowerupId,
): Promise<{ ok: boolean; inventory?: PowerupInventory; reason?: string }> {
  const { data, error } = await supabase.rpc("consume_powerup", { p_item_id: id });
  if (error) return { ok: false, reason: error.message };
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(raw.ok),
    reason: raw.reason ? String(raw.reason) : undefined,
    inventory: raw.inventory ? parseInventory(raw.inventory) : undefined,
  };
}
