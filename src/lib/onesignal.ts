import OneSignal from "react-onesignal";

export const ONESIGNAL_APP_ID = "718bec75-70f7-4936-bdff-5dd26e8c835d";

let initPromise: Promise<void> | null = null;
let lastIdentified: string | null = null;
let promptStarted = false;

/** Unregister every non-OneSignal service worker so only one push system owns `/`. */
async function clearOtherServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (reg) => {
        const url =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
        if (!url.includes("OneSignalSDKWorker")) {
          await reg.unregister();
        }
      })
    );
  } catch {
    /* ignore */
  }
}

async function waitForWorker(timeoutMs = 8000): Promise<boolean> {
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

/** Single OneSignal init for the whole app. */
export function initOneSignal(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      await clearOtherServiceWorkers();
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        notifyButton: { enable: false },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: true,
                text: {
                  actionMessage: "Allow notifications to get class updates, messages, quizzes, and activities.",
                  acceptButton: "Allow",
                  cancelButton: "Later",
                },
                delay: { pageViews: 1, timeDelay: 1 },
              },
            ],
          },
        },
      });
      await waitForWorker(5000);
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

export async function logoutOneSignal() {
  lastIdentified = null;
  promptStarted = false;
  try {
    await OneSignal.logout();
  } catch {
    /* ignore */
  }
}

/**
 * Show the allow-notifications prompt as soon as the app opens.
 * Uses OneSignal Slidedown (then browser Allow), then opts in the subscription.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  await initOneSignal();
  await waitForWorker(8000);

  try {
    // Already allowed — just make sure subscription is active
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch {
        /* ignore */
      }
      return true;
    }

    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return false;
    }

    if (promptStarted) return Boolean(OneSignal.Notifications.permission);
    promptStarted = true;

    // Soft prompt appears immediately; Accept triggers the browser Allow dialog
    try {
      await OneSignal.Slidedown.promptPush();
    } catch {
      // Fallback: native permission (may be blocked without gesture on some browsers)
      try {
        await OneSignal.Notifications.requestPermission();
      } catch {
        /* ignore */
      }
    }

    if (OneSignal.Notifications.permission || Notification.permission === "granted") {
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch {
        /* ignore */
      }
      return true;
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
    if (typeof Notification !== "undefined" && Notification.permission === "granted") return true;
    return Boolean(OneSignal.Notifications.permission);
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
    let json: { id?: string; skipped?: boolean; reason?: string } | null = null;
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      console.error("[push] error", res.status, text);
      return { ok: false, detail: text.slice(0, 200) };
    }
    if (json?.skipped) return { ok: false, detail: json.reason };
    if (json && "id" in json && json.id === "") {
      return { ok: false, detail: "No subscribed recipients matched" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[push] network error", e);
    return { ok: false, detail: e instanceof Error ? e.message : "network error" };
  }
}
