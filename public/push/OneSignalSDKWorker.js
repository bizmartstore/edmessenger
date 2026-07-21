/* OneSignal Web Push service worker (v16) */
// Chrome requires a message listener during initial worker evaluation (before importScripts).
self.addEventListener("message", () => {});
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
