importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

/* Keep-alive while OneSignal SW is alive (do not register a second SW at /) */
async function pingKeepAlive() {
  try {
    await fetch("/api/keepalive", { method: "GET", cache: "no-store" });
  } catch {
    /* ignore */
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "KEEPALIVE") {
    event.waitUntil(pingKeepAlive());
  }
});

setInterval(() => {
  pingKeepAlive();
}, 4 * 60 * 1000);
