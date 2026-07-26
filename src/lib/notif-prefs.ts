/**
 * Per-user notification category preferences.
 * Stored in localStorage per userId. Also mirrored as OneSignal user tags
 * (notif_<key> = "on" | "off") so server-side filtering can be layered on later.
 */
import { setupOneSignalForUser } from "@/lib/onesignal";

export type NotifCategory =
  | "dm"
  | "classroom"
  | "group"
  | "wall"
  | "announcement"
  | "lesson"
  | "activity"
  | "quiz"
  | "submission"
  | "new_user";

export interface NotifCategoryMeta {
  key: NotifCategory;
  label: string;
  description: string;
  audience: "student" | "admin" | "both";
}

export const NOTIF_CATEGORIES: NotifCategoryMeta[] = [
  { key: "dm", label: "Private messages", description: "Someone sends you a private message", audience: "both" },
  { key: "classroom", label: "Classroom chat", description: "New message in the classroom group chat", audience: "both" },
  { key: "group", label: "Group chats", description: "New message in a student group you joined", audience: "both" },
  { key: "wall", label: "Class wall", description: "Someone posts on the class wall", audience: "both" },
  { key: "announcement", label: "Announcements", description: "Admin posts a new announcement", audience: "student" },
  { key: "lesson", label: "New lessons", description: "Admin uploads a new lesson or module", audience: "student" },
  { key: "activity", label: "New activities", description: "Admin posts a new activity", audience: "student" },
  { key: "quiz", label: "New quizzes", description: "Admin posts a new quiz", audience: "student" },
  { key: "submission", label: "Student submissions", description: "A student submits a quiz or activity", audience: "admin" },
  { key: "new_user", label: "New students", description: "A new student signs in for the first time", audience: "admin" },
];

export type NotifPrefs = Record<NotifCategory, boolean>;

const DEFAULT_PREFS: NotifPrefs = {
  dm: true,
  classroom: true,
  group: true,
  wall: true,
  announcement: true,
  lesson: true,
  activity: true,
  quiz: true,
  submission: true,
  new_user: true,
};

function storageKey(userId: string): string {
  return `edm:notif-prefs:${userId}`;
}

export function getNotifPrefs(userId: string): NotifPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setNotifPref(userId: string, key: NotifCategory, value: boolean): NotifPrefs {
  const next = { ...getNotifPrefs(userId), [key]: value };
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // ignore
  }
  // Mirror into OneSignal tags only after login settles (best-effort).
  void (async () => {
    try {
      const OneSignal = await setupOneSignalForUser(userId, "student");
      OneSignal.User.addTag?.(`notif_${key}`, value ? "on" : "off");
    } catch {
      // ignore
    }
  })();
  return next;
}

export function isCategoryMuted(userId: string | null | undefined, key: NotifCategory): boolean {
  if (!userId) return false;
  return getNotifPrefs(userId)[key] === false;
}

export function syncAllTags(userId: string, role: "admin" | "student" = "student"): void {
  const prefs = getNotifPrefs(userId);
  void (async () => {
    try {
      const OneSignal = await setupOneSignalForUser(userId, role);
      // Wait for External ID to settle after login() transfer (409 is expected mid-transfer).
      for (let i = 0; i < 20; i++) {
        if (OneSignal.User.externalId === userId) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      if (OneSignal.User.externalId !== userId) return;
      const tags: Record<string, string> = {};
      for (const cat of NOTIF_CATEGORIES) {
        tags[`notif_${cat.key}`] = prefs[cat.key] ? "on" : "off";
      }
      OneSignal.User.addTags?.(tags);
    } catch {
      // ignore — tags are optional; push delivery uses external_id, not tags
    }
  })();
}
