import OneSignal from "react-onesignal";

export const ONESIGNAL_APP_ID = "718bec75-70f7-4936-bdff-5dd26e8c835d";

/** Bump when SW setup changes so browsers drop broken cached workers once. */
const SW_RESET_KEY = "edmessenger.onesignal.swReset.v4";

let initPromise: Promise<void> | null = null;
let lastIdentified: string | null = null;
let promptStarted = false;

function swScriptUrl(reg: ServiceWorkerRegistration): string {
  return reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
}

/** Unregister every service worker (OneSignal included). */
async function unregisterAllServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
  } catch {
    /* ignore */
  }
}

/**
 * Drop non-OneSignal workers, and any OneSignal registration that is stuck
 * without an active worker (common after a bad/HTML SW body).
 */
async function clearBrokenServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (reg) => {
        const url = swScriptUrl(reg);
        const isOneSignal = url.includes("OneSignalSDKWorker");
        if (!isOneSignal || !reg.active) {
          await reg.unregister().catch(() => false);
        }
      }),
    );
  } catch {
    /* ignore */
  }
}

/** One-time hard reset so old custom / HTML service workers cannot linger. */
async function maybeHardResetServiceWorkers(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(SW_RESET_KEY) === "1") return;
    await unregisterAllServiceWorkers();
    localStorage.setItem(SW_RESET_KEY, "1");
  } catch {
    /* ignore */
  }
}

async function waitForWorker(timeoutMs = 10000): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const regs = await navigator.serviceWorker.getRegistrations();
    const os = regs.find((r) => swScriptUrl(r).includes("OneSignalSDKWorker"));
    if (os?.active) {
      try {
        await navigator.serviceWorker.ready;
      } catch {
        /* ignore */
      }
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function pushSubscriptionReady(): boolean {
  try {
    const sub = OneSignal.User.PushSubscription as {
      optedIn?: boolean;
      id?: string | null;
      token?: string | null;
    };
    return Boolean(sub.optedIn && (sub.id || sub.token));
  } catch {
    return false;
  }
}

/** Single OneSignal init for the whole app. */
export function initOneSignal(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      await maybeHardResetServiceWorkers();
      await clearBrokenServiceWorkers();

      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        notifyButton: { enable: false },
        // Avoid showNotification before the SW is active
        welcomeNotification: { disable: true },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                text: {
                  actionMessage:
                    "Allow notifications to get class updates, messages, quizzes, and activities.",
                  acceptButton: "Allow",
                  cancelButton: "Later",
                },
              },
            ],
          },
        },
      });

      const ready = await waitForWorker(10000);
      if (!ready) {
        console.warn("[onesignal] service worker not active after init — forcing re-register");
        await unregisterAllServiceWorkers();
        // Re-init is not supported; page reload after reset is the reliable recovery
        try {
          localStorage.setItem(SW_RESET_KEY, "0");
        } catch {
          /* ignore */
        }
      }
    })().catch((e) => {
      console.error("[onesignal] init failed", e);
      initPromise = null;
    });
  }
  return initPromise ?? Promise.resolve();
}

export async function identifyOneSignalUser(userId: string, role: "admin" | "student") {
  await initOneSignal();
  if (lastIdentified === `${userId}:${role}`) return;
  try {
    await OneSignal.login(userId);
    OneSignal.User.addTags({ role, app: "edmessenger" });
    lastIdentified = `${userId}:${role}`;
  } catch (e) {
    console.warn("[onesignal] identify failed", e);
  }
}

/** Force re-login + tags after a successful subscribe (links push token to external_id + role). */
export async function bindPushIdentity(userId: string, role: "admin" | "student") {
  await initOneSignal();
  try {
    await OneSignal.login(userId);
    OneSignal.User.addTags({ role, app: "edmessenger" });
    lastIdentified = `${userId}:${role}`;
  } catch (e) {
    console.warn("[onesignal] bindPushIdentity failed", e);
  }
}

export async function logoutOneSignal() {
  lastIdentified = null;
  promptStarted = false;
  try {
    await OneSignal.logout();
  } catch {
    /* ignore */
  }
}

async function optInAndVerify(): Promise<boolean> {
  const ready = await waitForWorker(8000);
  if (!ready) {
    console.warn("[onesignal] cannot optIn — no active OneSignal service worker");
    return false;
  }
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (e) {
    console.warn("[onesignal] optIn failed", e);
  }
  // Give the browser a moment to finish pushManager.subscribe
  for (let i = 0; i < 20; i++) {
    if (pushSubscriptionReady()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return pushSubscriptionReady();
}

/**
 * Show the allow-notifications prompt as soon as the app opens.
 * Uses OneSignal Slidedown (then browser Allow), then opts in the subscription.
 */
export async function ensurePushSubscription(opts?: { forcePrompt?: boolean }): Promise<boolean> {
  await initOneSignal();

  try {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return false;
    }

    // Already allowed — ensure we have a real push token
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const ok = await optInAndVerify();
      if (ok) return true;

      // Token still empty: wipe SWs once and ask user to reload
      console.warn("[onesignal] permission granted but no push token — resetting service workers");
      await unregisterAllServiceWorkers();
      try {
        localStorage.removeItem(SW_RESET_KEY);
      } catch {
        /* ignore */
      }
      return false;
    }

    if (promptStarted && !opts?.forcePrompt) return pushSubscriptionReady();
    promptStarted = true;

    try {
      await OneSignal.Slidedown.promptPush();
    } catch {
      try {
        await OneSignal.Notifications.requestPermission();
      } catch {
        /* ignore */
      }
    }

    if (OneSignal.Notifications.permission || Notification.permission === "granted") {
      return await optInAndVerify();
    }
    return false;
  } catch (e) {
    console.error("[onesignal] ensurePushSubscription failed", e);
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  await initOneSignal();
  try {
    if (pushSubscriptionReady()) return true;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      return Boolean(
        (OneSignal.User.PushSubscription as { optedIn?: boolean }).optedIn ||
          OneSignal.Notifications.permission,
      );
    }
    return Boolean(OneSignal.Notifications.permission);
  } catch {
    return false;
  }
}

export type NotifyPayload = {
  title: string;
  message: string;
  url?: string;
  audience?: "students" | "admins" | "users" | "all";
  userIds?: string[];
  excludeUserIds?: string[];
};

/** Only send path — Worker → OneSignal REST. */
export async function sendPush(payload: NotifyPayload): Promise<{ ok: boolean; detail?: string }> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const path = payload.url ?? "/";
    const absoluteUrl = path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`;

    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, url: absoluteUrl, origin }),
    });
    const text = await res.text();
    let json: { id?: string; skipped?: boolean; reason?: string; errors?: unknown } | null = null;
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      console.error("[push] OneSignal rejected", res.status, text);
      return { ok: false, detail: text.slice(0, 200) };
    }
    if (json?.skipped) {
      console.error("[push] skipped:", json.reason);
      return { ok: false, detail: json.reason };
    }
    if (json && "id" in json && json.id === "") {
      console.error("[push] no matching subscribed recipients", text);
      return { ok: false, detail: "No subscribed recipients matched — recipient may not have allowed notifications" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[push] network error", e);
    return { ok: false, detail: e instanceof Error ? e.message : "network error" };
  }
}
