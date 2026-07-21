/** Client helper — POSTs to Worker for OneSignal push. Fire-and-forget. */

export type PushAudience =
  | { type: "external_ids"; externalIds: string[] }
  | { type: "role"; role: "admin" | "student" }
  | { type: "role_except"; role: "admin" | "student"; excludeIds: string[] }
  | { type: "all_except"; excludeIds: string[] };

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  audience: PushAudience;
}

const recentKeys = new Map<string, number>();

function shouldSend(payload: PushPayload): boolean {
  const key = JSON.stringify(payload);
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev && now - prev < 3000) return false;
  recentKeys.set(key, now);
  // prune
  for (const [k, t] of recentKeys) {
    if (now - t > 10000) recentKeys.delete(k);
  }
  return true;
}

export function sendPushNotification(payload: PushPayload): void {
  if (typeof window === "undefined") return;
  const audience = payload.audience;
  if (audience.type === "external_ids" && audience.externalIds.length === 0) return;
  if (!shouldSend(payload)) return;

  void (async () => {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        // still attempt without auth
      }

      await fetch("/api/push/notify", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: payload.title.slice(0, 80),
          body: payload.body.slice(0, 240),
          url: payload.url,
          audience,
        }),
        keepalive: true,
      });
    } catch {
      // non-fatal
    }
  })();
}

export function notifyUsers(externalIds: string[], title: string, body: string, url?: string): void {
  const ids = [...new Set(externalIds.filter(Boolean))];
  if (!ids.length) return;
  sendPushNotification({
    title,
    body,
    url,
    audience: { type: "external_ids", externalIds: ids },
  });
}

export function notifyRole(role: "admin" | "student", title: string, body: string, url?: string): void {
  sendPushNotification({
    title,
    body,
    url,
    audience: { type: "role", role },
  });
}

export function notifyRoleExcept(
  role: "admin" | "student",
  excludeIds: string[],
  title: string,
  body: string,
  url?: string,
): void {
  sendPushNotification({
    title,
    body,
    url,
    audience: { type: "role_except", role, excludeIds },
  });
}

export function notifyAllExcept(excludeIds: string[], title: string, body: string, url?: string): void {
  sendPushNotification({
    title,
    body,
    url,
    audience: { type: "all_except", excludeIds },
  });
}