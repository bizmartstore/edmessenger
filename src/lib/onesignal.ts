import OneSignal from "react-onesignal";

export const ONESIGNAL_APP_ID = "718bec75-70f7-4936-bdff-5dd26e8c835d";

let initPromise: Promise<void> | null = null;

export function initOneSignal(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/" },
      notifyButton: { enable: false },
      // Keep subscription across sessions so closed-app pushes still deliver
      serviceWorkerUpdaterPath: undefined,
    }).then(() => undefined);
  }
  return initPromise;
}

/** Link this device subscription to the signed-in user + role tag (required for targeting). */
export async function identifyOneSignalUser(userId: string, role: "admin" | "student") {
  await initOneSignal();
  try {
    await OneSignal.login(userId);
    OneSignal.User.addTags({ role, app: "edmessenger" });
    // If browser already granted permission, ensure push channel is opted in
    if (OneSignal.Notifications.permission) {
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export async function logoutOneSignal() {
  try {
    await OneSignal.logout();
  } catch {
    /* ignore */
  }
}

export async function requestPushPermission(): Promise<boolean> {
  await initOneSignal();
  try {
    await OneSignal.Notifications.requestPermission();
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch {
      /* ignore */
    }
    return Boolean(OneSignal.Notifications.permission);
  } catch {
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  await initOneSignal();
  try {
    return Boolean(OneSignal.Notifications.permission);
  } catch {
    return false;
  }
}

export type NotifyPayload = {
  title: string;
  message: string;
  url?: string;
  /** Target: students | admins | specific external user ids */
  audience?: "students" | "admins" | "users";
  userIds?: string[];
  /** Optional: do not notify this user (e.g. message sender) */
  excludeUserIds?: string[];
};

/**
 * Send via Worker → OneSignal REST.
 * Works when recipients' apps are closed, as long as they subscribed once
 * and ONESIGNAL_REST_API_KEY is set on the Worker.
 */
export async function sendPush(payload: NotifyPayload): Promise<{ ok: boolean; detail?: string }> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const path = payload.url ?? "/";
    const absoluteUrl = path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`;

    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        url: absoluteUrl,
        origin,
      }),
    });
    const text = await res.text();
    let json: { id?: string; errors?: unknown; skipped?: boolean; reason?: string; recipients?: number } | null = null;
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* plain text */
    }
    if (!res.ok) {
      console.error("[push] OneSignal error", res.status, text);
      return { ok: false, detail: text.slice(0, 200) };
    }
    if (json?.skipped) {
      console.warn("[push] skipped:", json.reason);
      return { ok: false, detail: json.reason };
    }
    // Empty id means OneSignal accepted but delivered to 0 devices
    if (json && "id" in json && json.id === "") {
      console.warn("[push] sent to 0 recipients", text);
      return { ok: false, detail: "No subscribed recipients matched" };
    }
    return { ok: true, detail: text.slice(0, 120) };
  } catch (e) {
    console.error("[push] network error", e);
    return { ok: false, detail: e instanceof Error ? e.message : "network error" };
  }
}
