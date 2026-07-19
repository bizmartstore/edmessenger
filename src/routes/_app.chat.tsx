import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageComposer } from "@/components/MessageComposer";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import { Users, MessagesSquare } from "lucide-react";
import {
  appendClassroomCache,
  getClassroomCache,
  MSG_LIMIT,
  removeClassroomCache,
  setClassroomCache,
  type ClassMsg,
} from "@/lib/chat-cache";
import { getCachedProfile, rememberProfile, rememberProfiles } from "@/lib/profile-cache";
import { sendPush } from "@/lib/onesignal";
import { UnreadBadge, useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useLiveReload } from "@/hooks/useLiveReload";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

interface DMPreview {
  peer_id: string;
  peer_name: string | null;
  peer_avatar: string | null;
  last_message: string;
  last_at: string;
}

async function loadClassroomMessages(): Promise<ClassMsg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, content, attachments, created_at")
    .order("created_at", { ascending: false })
    .limit(MSG_LIMIT);

  if (error) throw error;
  const rows = ((data ?? []) as ClassMsg[]).reverse();
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", ids);
  rememberProfiles((profiles ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]);
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    profiles: map.get(r.user_id)
      ? { full_name: map.get(r.user_id)!.full_name, avatar_url: map.get(r.user_id)!.avatar_url }
      : null,
  }));
}

async function resolveClassProfile(userId: string): Promise<ClassMsg["profiles"]> {
  const cached = getCachedProfile(userId);
  if (cached) return cached;
  const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
  if (p) rememberProfile(userId, p);
  return (p as ClassMsg["profiles"]) ?? null;
}

function ChatPage() {
  const { user, profile } = useAuth();
  const { counts, markRead } = useUnreadBadges();
  const [tab, setTab] = useState<"class" | "dms">("class");
  const [messages, setMessages] = useState<ClassMsg[]>(() => getClassroomCache());
  const [loading, setLoading] = useState(() => getClassroomCache().length === 0);
  const [dms, setDms] = useState<DMPreview[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<{ id: string; full_name: string | null; avatar_url: string | null }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === "class") void markRead("classroom");
    else void markRead("dms");
  }, [tab, markRead]);

  const refreshClassroom = useCallback(async () => {
    try {
      const rows = await loadClassroomMessages();
      setClassroomCache(rows);
      setMessages(rows);
    } catch {
      /* keep cache */
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDms = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("list_dm_previews");
    setDms((data ?? []) as DMPreview[]);
  }, [user]);

  // Load classroom once on mount + keep realtime for life of page (both tabs)
  useEffect(() => {
    void refreshClassroom();
    const ch = supabase
      .channel("classroom-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const row = payload.new as ClassMsg;
        const p = await resolveClassProfile(row.user_id);
        const next = appendClassroomCache({ ...row, profiles: p });
        setMessages([...next]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (id) setMessages([...removeClassroomCache(id)]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refreshClassroom]);

  useEffect(() => {
    if (tab !== "dms" || !user) return;
    void refreshDms();
  }, [tab, user, refreshDms]);

  // Live DM inbox — Realtime signal, debounced RPC (no polling)
  useLiveReload(
    "dm-inbox-live",
    [{ table: "direct_messages", event: "INSERT" }],
    refreshDms,
    { enabled: tab === "dms" && Boolean(user), debounceMs: 500 },
  );

  useEffect(() => {
    if (tab === "class") bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, tab]);

  useEffect(() => {
    if (tab !== "dms") return;
    const q = peopleQuery.trim();
    if (q.length < 1) {
      setPeople([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .neq("id", user?.id ?? "")
        .ilike("full_name", `%${q}%`)
        .limit(10);
      setPeople(data ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [peopleQuery, tab, user?.id]);

  async function sendClass(text: string, attachments: UploadedFile[]) {
    if (!user) return;
    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        content: text,
        attachments: attachments.length ? attachments : null,
      })
      .select("id, user_id, content, attachments, created_at")
      .single();
    if (error) throw error;
    if (data) {
      rememberProfile(user.id, {
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      });
      const next = appendClassroomCache({
        ...(data as ClassMsg),
        profiles: { full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null },
      });
      setMessages([...next]);
    }
    void supabase.rpc("prune_classroom_messages");
    void sendPush({
      title: "New classroom message",
      message: `${profile?.full_name ?? "Someone"}: ${text.slice(0, 60) || "Sent an attachment"}`,
      url: "/chat",
      audience: "all",
    });
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-4 flex flex-col h-[calc(100dvh-7rem)]">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setTab("class")}
          className={`relative flex-1 py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${tab === "class" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}
        >
          <Users className="h-4 w-4" /> Classroom
          {tab !== "class" && <UnreadBadge count={counts.classroom} className="top-1 right-2" />}
        </button>
        <button
          onClick={() => setTab("dms")}
          className={`relative flex-1 py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${tab === "dms" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}
        >
          <MessagesSquare className="h-4 w-4" /> Direct
          {tab !== "dms" && <UnreadBadge count={counts.dms} className="top-1 right-2" />}
        </button>
      </div>

      {tab === "class" ? (
        <>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {loading && messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-10">Loading messages…</div>
            )}
            {!loading && messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-10">No messages yet. Say hi</div>
            )}
            {messages.map((m) => {
              const mine = m.user_id === user?.id;
              const name = m.profiles?.full_name ?? "Student";
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"} animate-fade-up`}>
                  {!mine &&
                    (m.profiles?.avatar_url ? (
                      <img src={m.profiles.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 mt-auto" />
                    ) : (
                      <div className="h-7 w-7 rounded-full gradient-primary grid place-items-center text-[10px] text-primary-foreground font-bold shrink-0 mt-auto">
                        {name[0]?.toUpperCase()}
                      </div>
                    ))}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? "gradient-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}
                  >
                    {!mine && <div className="text-[10px] font-semibold opacity-70 mb-0.5">{name}</div>}
                    {m.content && <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>}
                    <AttachmentList files={m.attachments} />
                    <div className={`text-[9px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="pt-2 sticky bottom-0">
            {user && <MessageComposer userId={user.id} onSend={sendClass} placeholder="Message the classroom…" />}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          <input
            value={peopleQuery}
            onChange={(e) => setPeopleQuery(e.target.value)}
            placeholder="Search classmates by name…"
            className="w-full px-4 py-3 rounded-2xl bg-muted border border-border focus:border-primary outline-none text-sm"
          />
          {peopleQuery && people.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">Start new</div>
              {people.map((p) => (
                <Link
                  key={p.id}
                  to="/dm/$peerId"
                  params={{ peerId: p.id }}
                  className="flex items-center gap-3 p-2 rounded-2xl hover:bg-muted"
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground text-sm font-bold">
                      {(p.full_name ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="text-sm font-medium">{p.full_name ?? "Student"}</div>
                </Link>
              ))}
            </div>
          )}

          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1 pt-2">Conversations</div>
          {dms.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">No direct messages yet.</div>
          )}
          {dms.map((d) => (
            <Link
              key={d.peer_id}
              to="/dm/$peerId"
              params={{ peerId: d.peer_id }}
              className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border shadow-card hover:shadow-glow transition-all"
            >
              {d.peer_avatar ? (
                <img src={d.peer_avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="h-11 w-11 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold">
                  {(d.peer_name ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{d.peer_name ?? "Student"}</div>
                <div className="text-xs text-muted-foreground truncate">{d.last_message || "Sent an attachment"}</div>
              </div>
              <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(d.last_at), { addSuffix: true })}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
