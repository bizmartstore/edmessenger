import { ONESIGNAL_APP_ID } from "@/lib/onesignal-config";

type OneSignalSDK = {
  init: (opts: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User: {
    PushSubscription: {
      optedIn: boolean;
      id?: string | null;
      addEventListener: (event: string, listener: () => void) => void;
      removeEventListener: (event: string, listener: () => void) => void;
    };
    addTags: (tags: Record<string, string>) => void;
  };
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
let identifiedUserId: string | null = null;

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

export function initOneSignal(): Promise<OneSignalSDK> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OneSignal is browser-only"));
  }
  if (initPromise) return initPromise;

  ensureScript();
  initPromise = new Promise((resolve, reject) => {
    withSdk(async (OneSignal) => {
      try {
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
                  autoPrompt: false,
                },
              ],
            },
          },
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

export async function identifyOneSignalUser(
  userId: string,
  role: "admin" | "student",
): Promise<void> {
  const OneSignal = await initOneSignal();
  if (identifiedUserId && identifiedUserId !== userId) {
    await OneSignal.logout();
  }
  await OneSignal.login(userId);
  identifiedUserId = userId;
  OneSignal.User.addTags({ role });
}

export async function logoutOneSignal(): Promise<void> {
  if (!initPromise) {
    identifiedUserId = null;
    return;
  }
  try {
    const OneSignal = await initOneSignal();
    await OneSignal.logout();
  } catch {
    // ignore
  }
  identifiedUserId = null;
}

export async function isPushOptedIn(): Promise<boolean> {
  try {
    const OneSignal = await initOneSignal();
    return Boolean(OneSignal.User.PushSubscription.optedIn);
  } catch {
    return false;
  }
}

export async function requestPushPermission(): Promise<boolean> {
  const OneSignal = await initOneSignal();
  const granted = await OneSignal.Notifications.requestPermission();
  return Boolean(granted || OneSignal.User.PushSubscription.optedIn);
}

export function subscribePushChange(listener: () => void): () => void {
  let unsub: (() => void) | null = null;
  void initOneSignal()
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
