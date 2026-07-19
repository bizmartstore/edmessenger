import type { UploadedFile } from "@/lib/upload";

export const MSG_LIMIT = 50;

export interface ClassMsg {
  id: string;
  user_id: string;
  content: string;
  attachments: UploadedFile[] | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

export interface DmMsg {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachments: UploadedFile[] | null;
  created_at: string;
}

/** In-memory cache so navigating away from Chat does not wipe the UI */
let classroomCache: ClassMsg[] = [];
const dmCache = new Map<string, DmMsg[]>();

export function getClassroomCache(): ClassMsg[] {
  return classroomCache;
}

export function setClassroomCache(msgs: ClassMsg[]) {
  classroomCache = msgs.slice(-MSG_LIMIT);
}

export function appendClassroomCache(msg: ClassMsg) {
  if (classroomCache.some((m) => m.id === msg.id)) return classroomCache;
  classroomCache = [...classroomCache, msg].slice(-MSG_LIMIT);
  return classroomCache;
}

export function removeClassroomCache(id: string) {
  classroomCache = classroomCache.filter((m) => m.id !== id);
  return classroomCache;
}

export function getDmCache(peerId: string): DmMsg[] {
  return dmCache.get(peerId) ?? [];
}

export function setDmCache(peerId: string, msgs: DmMsg[]) {
  dmCache.set(peerId, msgs.slice(-MSG_LIMIT));
}

export function appendDmCache(peerId: string, msg: DmMsg) {
  const prev = dmCache.get(peerId) ?? [];
  if (prev.some((m) => m.id === msg.id)) return prev;
  const next = [...prev, msg].slice(-MSG_LIMIT);
  dmCache.set(peerId, next);
  return next;
}

export function removeDmCache(peerId: string, id: string) {
  const next = (dmCache.get(peerId) ?? []).filter((m) => m.id !== id);
  dmCache.set(peerId, next);
  return next;
}

export function trimLatest<T>(list: T[]): T[] {
  if (list.length <= MSG_LIMIT) return list;
  return list.slice(list.length - MSG_LIMIT);
}
