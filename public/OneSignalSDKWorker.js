importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

/** Keep app-icon badge fresh when a push arrives while the app is closed. */
const IDB_NAME = "edmessenger-badge";
const IDB_VERSION = 1;
const STORE = "state";
const KEY = "unreadTotal";

function openBadgeDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("badge db open failed"));
  });
}

async function getStoredTotal() {
  try {
    const db = await openBadgeDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("badge read failed"));
    });
    db.close();
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

async function setStoredTotal(total) {
  try {
    const db = await openBadgeDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(Math.max(0, Math.floor(total)), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("badge write failed"));
    });
    db.close();
  } catch {
    // ignore
  }
}

async function bumpAppBadge() {
  const next = Math.max(1, (await getStoredTotal()) + 1);
  await setStoredTotal(next);
  try {
    if (typeof self.navigator?.setAppBadge === "function") {
      await self.navigator.setAppBadge(next);
    }
  } catch {
    // Badging API unavailable (e.g. Android — system notification dot covers this)
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(bumpAppBadge());
});
