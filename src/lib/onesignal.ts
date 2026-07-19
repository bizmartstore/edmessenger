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
    }).then(() => undefined);
  }
  return initPromise;
}

export async function identifyOneSignalUser(userId: string, role: "admin" | "student") {
  await initOneSignal();
  try {
    await OneSignal.login(userId);
    OneSignal.User.addTag("role", role);
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
    return OneSignal.Notifications.permission;
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
  /** Target: all | students | admins | specific external user ids */
  audience?: "all" | "students" | "admins" | "users";
  userIds?: string[];
};

/** Send via our Worker → OneSignal REST (requires ONESIGNAL_REST_API_KEY secret). */
export async function sendPush(payload: NotifyPayload): Promise<void> {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* non-blocking */
  }
}
