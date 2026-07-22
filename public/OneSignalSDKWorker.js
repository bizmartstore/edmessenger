/* OneSignal Web Push service worker (v16).
 * Keep this listener before importScripts: Chromium requires message handlers
 * to exist during the worker's initial synchronous evaluation.
 */
self.addEventListener("message", function () {});
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");