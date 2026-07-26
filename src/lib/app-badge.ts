/** PWA app-icon badge + tab title sync (Messenger-style unread). */

const IDB_NAME = "edmessenger-badge";
const IDB_VERSION = 1;
const STORE = "state";
const KEY = "unreadTotal";

const DEFAULT_TITLE = "EdMessenger — Learn. Communicate. Succeed.";

export type BadgeCounts = {
  chat: number;
  activities: number;
  lessons: number;
  quizzes: number;
  announcements: number;
};

export function totalUnread(counts: BadgeCounts): number {
  return (
    Math.max(0, counts.chat) +
    Math.max(0, counts.activities) +
    Math.max(0, counts.lessons) +
    Math.max(0, counts.quizzes) +
    Math.max(0, counts.announcements)
  );
}

function openBadgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function persistUnreadTotal(total: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openBadgeDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(Math.max(0, Math.floor(total)), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
    db.close();
  } catch {
    // ignore — badge still updates via Badging API when available
  }
}

export async function readPersistedUnreadTotal(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await openBadgeDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function syncDocumentTitle(total: number): void {
  if (typeof document === "undefined") return;
  document.title = total > 0 ? `(${total > 99 ? "99+" : total}) EdMessenger` : DEFAULT_TITLE;
}

type NavigatorWithBadge = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Sync OS/PWA icon badge, tab title, and SW-readable store. */
export async function syncAppBadge(total: number): Promise<void> {
  const n = Math.max(0, Math.floor(total));
  await persistUnreadTotal(n);
  syncDocumentTitle(n);

  if (typeof navigator === "undefined") return;
  const nav = navigator as NavigatorWithBadge;
  try {
    if (n > 0) {
      if (typeof nav.setAppBadge === "function") await nav.setAppBadge(n);
    } else if (typeof nav.clearAppBadge === "function") {
      await nav.clearAppBadge();
    }
  } catch {
    // Unsupported platform (e.g. Android Chrome uses notification dots instead)
  }
}

export async function clearAppBadge(): Promise<void> {
  await syncAppBadge(0);
}
