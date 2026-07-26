import { ONESIGNAL_APP_ID } from "@/lib/onesignal-config";

type PushSubscriptionAPI = {
  optedIn: boolean;
  id?: string | null;
  token?: string | null;
  optIn?: () => Promise<void>;
  optOut?: () => Promise<void>;
  addEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

type OneSignalUser = {
  onesignalId?: string | null;
  externalId?: string | null;
  PushSubscription: PushSubscriptionAPI;
  addTag?: (key: string, value: string) => void;
  addTags?: (tags: Record<string, string>) => void;
  addEventListener?: (event: "change", listener: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: "change", listener: (...args: unknown[]) => void) => void;
};

type OneSignalSDK = {
  init: (opts: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User: OneSignalUser;
  Notifications: {
    permission: boolean | "default" | "granted" | "denied";
    permissionNative?: NotificationPermission;
    requestPermission: () => Promise<boolean>;
    addEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
    removeEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalSDK) => void | Promise<void>>;
    OneSignal?: OneSignalSDK;
  }
}

let initPromise: Promise<OneSignalSDK> | null = null;
let identifyPromise: Promise<void> | null = null;
let identifiedUserId: string | null = null;
let lastSyncAt: number | null = null;
let cleanedLegacyWorkers = false;

const PUSH_EVENT = "edm:push-status-changed";

export function emitPushStatusChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PUSH_EVENT));
}

export function onPushStatusChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PUSH_EVENT, listener);
  return () => window.removeEventListener(PUSH_EVENT, listener);
}

export function getLastSyncAt(): number | null {
  return lastSyncAt;
}

function ensureScript(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("onesignal-sdk")) return;
  const script = document.createElement("script");
  script.id = "onesignal-sdk";
  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.defer = true;
  document.head.appendChild(script);
}

function withSdk(fn: (OneSignal: OneSignalSDK) => void | Promise<void>): void {
  if (typeof window === "undefined") return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

/**
 * Only remove the old /push/ scope worker from earlier setups.
 * Do NOT unregister the live OneSignal root worker — that causes
 * "No active registration" and duplicate Never Subscribed rows.
 */
async function removeLegacyPushWorkers(): Promise<void> {
  if (cleanedLegacyWorkers || !("serviceWorker" in navigator)) return;
  cleanedLegacyWorkers = true;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        const scopePath = new URL(registration.scope).pathname;
        if (scopePath === "/push/" || scopePath.endsWith("/push/")) {
          return registration.unregister();
        }
      }),
    );
  } catch {
    // ignore
  }
}

function initOneSignalSdk(): Promise<OneSignalSDK> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OneSignal is browser-only"));
  }
  if (initPromise) return initPromise;

  ensureScript();
  initPromise = new Promise((resolve, reject) => {
    withSdk(async (OneSignal) => {
      try {
        await removeLegacyPushWorkers();
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: "/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/" },
          notifyButton: { enable: false },
          welcomeNotification: { disable: true },
          autoResubscribe: true,
          // No autoPrompt — subscribe only after login via requestPushPermission().
        });
        resolve(OneSignal);
      } catch (err) {
        initPromise = null;
        reject(err);
      }
    });
  });
  return initPromise;
}

/** Public init for callers that only need the SDK (prefer setupOneSignalForUser). */
export function initOneSignal(): Promise<OneSignalSDK> {
  return initOneSignalSdk();
}

/** Init SDK and identify the user in one step to avoid orphan anonymous subscriptions. */
export async function setupOneSignalForUser(
  userId: string,
  _role: "admin" | "student",
): Promise<OneSignalSDK> {
  const OneSignal = await initOneSignalSdk();
  await identifyOneSignalUser(userId);
  return OneSignal;
}

/**
 * Serialize login so concurrent profile/status/tag callers cannot start a second
 * identity transfer (which creates Never Subscribed + Subscribed duplicates).
 */
export async function identifyOneSignalUser(userId: string): Promise<void> {
  if (identifiedUserId === userId) return;

  if (identifyPromise) {
    await identifyPromise;
    if (identifiedUserId === userId) return;
  }

  identifyPromise = (async () => {
    const OneSignal = await initOneSignalSdk();

    // Already bound in IndexedDB from a prior session — still call login to
    // sync, but skip logout churn when switching isn't needed.
    if (identifiedUserId && identifiedUserId !== userId) {
      await OneSignal.logout();
      identifiedUserId = null;
    }

    await OneSignal.login(userId);
    // login() resolves after transfer; 409 in the network tab is expected when
    // the External ID already exists — the SDK switches to that user.
    identifiedUserId = userId;
    lastSyncAt = Date.now();
    emitPushStatusChanged();
  })();

  try {
    await identifyPromise;
  } finally {
    if (identifiedUserId === userId) {
      identifyPromise = null;
    } else {
      identifyPromise = null;
    }
  }
}

/**
 * Clears OneSignal + push-subscription state so a stale/404 subscription can
 * be rebuilt from scratch on the next opt-in. Reload the page after calling.
 */
export async function resetPushRegistration(): Promise<void> {
  identifiedUserId = null;
  initPromise = null;
  identifyPromise = null;
  cleanedLegacyWorkers = false;
  try {
    if (typeof indexedDB !== "undefined") {
      const dbs = ["ONE_SIGNAL_SDK_DB"];
      await Promise.all(
        dbs.map(
          (name) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
      );
    }
  } catch {
    // ignore
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => {
            const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
            return /OneSignalSDKWorker/.test(url);
          })
          .map((r) => r.unregister()),
      );
    }
  } catch {
    // ignore
  }
  lastSyncAt = Date.now();
  emitPushStatusChanged();
}

export async function getWorkerInfo(): Promise<{
  scope: string;
  scriptURL: string;
  state: string;
} | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const reg = regs.find((r) => {
      const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
      return /OneSignalSDKWorker/.test(url);
    });
    if (!reg) return null;
    const sw = reg.active ?? reg.installing ?? reg.waiting;
    return {
      scope: reg.scope,
      scriptURL: sw?.scriptURL ?? "",
      state: sw?.state ?? "unknown",
    };
  } catch {
    return null;
  }
}

export async function logoutOneSignal(): Promise<void> {
  if (!identifiedUserId) return;
  try {
    const OneSignal = await initOneSignalSdk();
    await OneSignal.logout();
  } catch {
    // ignore
  }
  identifiedUserId = null;
}

export async function isPushOptedIn(userId: string, role: "admin" | "student" = "student"): Promise<boolean> {
  try {
    await setupOneSignalForUser(userId, role);
    const OneSignal = await initOneSignalSdk();
    return Boolean(OneSignal.User.PushSubscription.optedIn);
  } catch {
    return false;
  }
}

export type PushStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  optedIn: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  iosNeedsInstall: boolean;
};

export function getEnvPushInfo(): { supported: boolean; isIOS: boolean; isStandalone: boolean } {
  if (typeof window === "undefined") {
    return { supported: false, isIOS: false, isStandalone: false };
  }
  const ua = window.navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const standaloneNav = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isStandalone =
    standaloneNav || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const supported =
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    (!isIOS || isStandalone);
  return { supported, isIOS, isStandalone };
}

export async function getPushStatus(userId: string, role: "admin" | "student" = "student"): Promise<PushStatus> {
  const env = getEnvPushInfo();
  if (!env.supported) {
    return {
      supported: false,
      permission: "unsupported",
      optedIn: false,
      isIOS: env.isIOS,
      isStandalone: env.isStandalone,
      iosNeedsInstall: env.isIOS && !env.isStandalone,
    };
  }
  const permission: NotificationPermission =
    typeof Notification !== "undefined" ? Notification.permission : "default";
  let optedIn = false;
  try {
    await setupOneSignalForUser(userId, role);
    const OneSignal = await initOneSignalSdk();
    optedIn = Boolean(OneSignal.User.PushSubscription.optedIn);
  } catch {
    // ignore
  }
  return {
    supported: true,
    permission,
    optedIn,
    isIOS: env.isIOS,
    isStandalone: env.isStandalone,
    iosNeedsInstall: false,
  };
}

/**
 * Opt in using only PushSubscription.optIn().
 * Calling requestPermission() + optIn() together creates a second empty
 * "Never Subscribed" row beside the real Subscribed subscription.
 */
export async function requestPushPermission(userId: string, role: "admin" | "student" = "student"): Promise<boolean> {
  await setupOneSignalForUser(userId, role);
  const OneSignal = await initOneSignalSdk();
  if (OneSignal.User.PushSubscription.optedIn) return true;

  // Wait for the SW to be ready before prompting — avoids
  // "No active registration available on the ServiceWorkerRegistration".
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.ready;
    } catch {
      // ignore
    }
  }

  if (typeof OneSignal.User.PushSubscription.optIn === "function") {
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch {
      // ignore
    }
  }

  return Boolean(OneSignal.User.PushSubscription.optedIn);
}

export function subscribePushChange(
  userId: string,
  role: "admin" | "student",
  listener: () => void,
): () => void {
  let unsub: (() => void) | null = null;
  void setupOneSignalForUser(userId, role)
    .then((OneSignal) => {
      const handler = () => listener();
      OneSignal.User.PushSubscription.addEventListener("change", handler);
      OneSignal.Notifications.addEventListener("permissionChange", handler);
      unsub = () => {
        OneSignal.User.PushSubscription.removeEventListener("change", handler);
        OneSignal.Notifications.removeEventListener("permissionChange", handler);
      };
    })
    .catch(() => {});
  return () => {
    unsub?.();
  };
}
