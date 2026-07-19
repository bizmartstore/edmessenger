import OneSignal from "react-onesignal";

export const ONESIGNAL_APP_ID = "718bec75-70f7-4936-bdff-5dd26e8c835d";

let initPromise: Promise<void> | null = null;

/** Drop old/conflicting SWs (e.g. public/sw.js) so OneSignal can own scope `/`. */
async function clearConflictingServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (reg) => {
        const url =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
        // Keep only OneSignal's worker
        if (url && !url.includes("OneSignalSDKWorker")) {
          await reg.unregister();
        }
      })
    );
  } catch {
    /* ignore */
  }
}

async function waitForOneSignalWorker(timeoutMs = 8000): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const regs = await navigator.serviceWorker.getRegistrations();
    const os = regs.find((r) => {
      const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
      return url.includes("OneSignalSDKWorker");
    });
    if (os?.active) {
      try {
        await navigator.serviceWorker.ready;
      } catch {
        /* ignore */
      }
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export function initOneSignal(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      await clearConflictingServiceWorkers();
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        notifyButton: { enable: false },
      });
      // Give the SW a moment to activate after init
      await waitForOneSignalWorker(5000);
    })();
  }
  return initPromise;
}

/** Link this device to the signed-in user + role tag (required for targeting). */
export async function identifyOneSignalUser(userId: string, role: "admin" | "student") {
  await initOneSignal();
  try {
    await OneSignal.login(userId);
    OneSignal.User.addTags({ role, app: "edmessenger" });
  } catch (e) {
    console.warn("[onesignal] identify failed", e);
  }
}

export async function logoutOneSignal() {
  try {
    await OneSignal.logout();
  } catch {
    /* ignore */
  }
}

/**
 * Ask for notification permission and create a real push subscription (needs active SW).
 * Call only from a user gesture (bell tap).
 */
export async function requestPushPermission(): Promise<boolean> {
  await initOneSignal();
  const swReady = await waitForOneSignalWorker(10000);
  if (!swReady) {
    console.error("[onesignal] Service worker not active — cannot subscribe");
    return false;
  }
  try {
    // Native permission prompt
    const permission = await OneSignal.Notifications.requestPermission();
    if (!permission) return false;

    // Create / enable Web Push subscription (needs active registration + non-empty token)
    await OneSignal.User.PushSubscription.optIn();

    // Verify we actually have a token
    const id = OneSignal.User.PushSubscription.id;
    const token = OneSignal.User.PushSubscription.token;
    if (!id && !token) {
      console.warn("[onesignal] opted in but subscription token missing — try again");
      return Boolean(OneSignal.Notifications.permission);
    }
    return true;
  } catch (e) {
    console.error("[onesignal] requestPushPermission failed", e);
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  await initOneSignal();
  try {
    const permitted = Boolean(OneSignal.Notifications.permission);
    const optedIn = OneSignal.User.PushSubscription.optedIn === true;
    return permitted && (optedIn || Boolean(OneSignal.User.PushSubscription.id));
  } catch {
    return false;
  }
}

export type NotifyPayload = {
  title: string;
  message: string;
  url?: string;
  audience?: "students" | "admins" | "users";
  userIds?: string[];
  excludeUserIds?: string[];
};

/** Send via Worker → OneSignal REST (works with app closed if recipients subscribed). */
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
    let json: { id?: string; skipped?: boolean; reason?: string } | null = null;
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
