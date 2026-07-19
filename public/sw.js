/* EdMessenger service worker — offline shell + keep-alive ping */
const CACHE = "edmessenger-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/logo.png", "/logo-pwa.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for app shell / API; cache fallback for static assets
  if (url.pathname.startsWith("/api/")) return;

  if (
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|webmanifest|js|css|woff2?)$/i) ||
    url.pathname === "/logo.png" ||
    url.pathname === "/logo-pwa.png"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && request.mode === "navigate") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match("/")))
  );
});

/** Periodic keep-alive so Supabase / worker stay warm while PWA is installed */
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "edmessenger-keepalive") {
    event.waitUntil(pingKeepAlive());
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "KEEPALIVE") {
    event.waitUntil(pingKeepAlive());
  }
});

async function pingKeepAlive() {
  try {
    await fetch("/api/keepalive", { method: "GET", cache: "no-store" });
  } catch {
    /* ignore */
  }
}

// Fallback interval while SW is alive (browsers differ on periodic sync)
setInterval(() => {
  pingKeepAlive();
}, 4 * 60 * 1000);
