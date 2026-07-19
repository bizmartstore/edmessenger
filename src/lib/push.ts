/** Client helper — POSTs to Worker for OneSignal push. Fire-and-forget. */

export type PushAudience =
  | { type: "external_ids"; externalIds: string[] }
  | { type: "role"; role: "admin" | "student" }
  | { type: "all_except"; excludeIds: string[] };

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  audience: PushAudience;
}

export function sendPushNotification(payload: PushPayload): void {
  if (typeof window === "undefined") return;
  const audience = payload.audience;
  if (audience.type === "external_ids" && audience.externalIds.length === 0) return;

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

export function notifyAllExcept(excludeIds: string[], title: string, body: string, url?: string): void {
  sendPushNotification({
    title,
    body,
    url,
    audience: { type: "all_except", excludeIds },
  });
}
