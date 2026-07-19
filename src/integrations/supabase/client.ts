import { createClient } from "@supabase/supabase-js";

// BYO Supabase — publishable (anon) key is safe to embed client-side.
const SUPABASE_URL = "https://ijxoffbsedvcqbqeohju.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_efDdsdHfnNGJVgvyxAlCKw_eZRxjE2p";

const isBrowser = typeof window !== "undefined";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    storage: isBrowser ? window.localStorage : undefined,
    storageKey: "educhat.auth",
    detectSessionInUrl: isBrowser,
    flowType: "pkce",
  },
  global: {
    fetch: (input, init) => {
      const h = new Headers(init?.headers);
      // Opaque sb_ keys aren't JWTs; strip default Bearer, keep apikey.
      if (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_") && h.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`) {
        h.delete("Authorization");
      }
      h.set("apikey", SUPABASE_PUBLISHABLE_KEY);
      return fetch(input, { ...init, headers: h });
    },
  },
});

export const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public`;
