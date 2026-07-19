/** Tiny in-memory profile cache so Realtime message inserts skip repeated REST lookups. */

type ProfileBits = { full_name: string | null; avatar_url: string | null };

const cache = new Map<string, ProfileBits>();

export function rememberProfile(id: string, bits: ProfileBits | null | undefined) {
  if (!id || !bits) return;
  cache.set(id, { full_name: bits.full_name ?? null, avatar_url: bits.avatar_url ?? null });
}

export function getCachedProfile(id: string): ProfileBits | undefined {
  return cache.get(id);
}

export function rememberProfiles(
  rows: { id: string; full_name: string | null; avatar_url: string | null }[],
) {
  for (const r of rows) rememberProfile(r.id, r);
}
