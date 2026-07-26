import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageComposer, type ReplyTarget } from "@/components/MessageComposer";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import {
  Users,
  MessagesSquare,
  UsersRound,
  Lock,
  Plus,
  Trash2,
  Reply,
  KeyRound,
  Loader2,
} from "lucide-react";
import {
  appendClassroomCache,
  clearDmCache,
  getClassroomCache,
  MSG_LIMIT,
  removeClassroomCache,
  setClassroomCache,
  type ClassMsg,
} from "@/lib/chat-cache";
import { getCachedProfile, rememberProfile, rememberProfiles } from "@/lib/profile-cache";
import { UnreadBadge, useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useLiveReload } from "@/hooks/useLiveReload";
import { notifyAllExcept } from "@/lib/push";
import { toast } from "sonner";

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

interface GroupPreview {
  id: string;
  name: string;
  description: string | null;
  has_password: boolean;
  created_by: string;
  created_at: string;
  member_count: number;
  is_member: boolean;
  last_message: string | null;
  last_at: string | null;
}

async function loadClassroomMessages(): Promise<ClassMsg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, content, attachments, created_at, reply_to_id, reply_to_content, reply_to_name")
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
  const navigate = useNavigate();
  const [tab, setTab] = useState<"class" | "dms" | "groups">("class");
  const [messages, setMessages] = useState<ClassMsg[]>(() => getClassroomCache());
  const [loading, setLoading] = useState(() => getClassroomCache().length === 0);
  const [dms, setDms] = useState<DMPreview[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<{ id: string; full_name: string | null; avatar_url: string | null }[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [groups, setGroups] = useState<GroupPreview[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPass, setCreatePass] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState<string | null>(null);
  const [joinPass, setJoinPass] = useState("");
  const [joining, setJoining] = useState(false);
  const [deletingPeer, setDeletingPeer] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === "class") void markRead("classroom");
    else if (tab === "dms") void markRead("dms");
    else void markRead("groups");
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

  const refreshGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_chat_groups");
      if (error) throw error;
      setGroups((data ?? []) as GroupPreview[]);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (tab !== "groups") return;
    void refreshGroups();
  }, [tab, refreshGroups]);

  useLiveReload(
    "dm-inbox-live",
    [{ table: "direct_messages", event: "INSERT" }],
    refreshDms,
    { enabled: tab === "dms" && Boolean(user), debounceMs: 500 },
  );

  useLiveReload(
    "groups-live",
    [
      { table: "chat_groups", event: "*" },
      { table: "group_messages", event: "INSERT" },
      { table: "chat_group_members", event: "*" },
    ],
    refreshGroups,
    { enabled: tab === "groups", debounceMs: 600 },
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

  async function sendClass(text: string, attachments: UploadedFile[], reply?: ReplyTarget | null) {
    if (!user) return;
    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        content: text,
        attachments: attachments.length ? attachments : null,
        reply_to_id: reply?.id ?? null,
        reply_to_content: reply ? (reply.content || "Attachment").slice(0, 160) : null,
        reply_to_name: reply?.name ?? null,
      })
      .select("id, user_id, content, attachments, created_at, reply_to_id, reply_to_content, reply_to_name")
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
      const preview = text.trim() || (attachments.length ? "Sent an attachment" : "New message");
      notifyAllExcept([user.id], profile?.full_name ?? "Classroom", preview, "/chat");
    }
    void supabase.rpc("prune_classroom_messages");
  }

  async function createGroup() {
    if (!createName.trim() || creating) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_chat_group", {
        p_name: createName.trim(),
        p_description: createDesc.trim() || null,
        p_password: createPass.trim() || null,
      });
      if (error) throw error;
      toast.success("Group created!");
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      setCreatePass("");
      void refreshGroups();
      if (data) {
        void navigate({ to: "/group/$groupId", params: { groupId: String(data) } });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setCreating(false);
    }
  }

  async function joinGroup(groupId: string, needsPass: boolean) {
    if (needsPass && !joinPass.trim()) {
      toast.error("Enter the group password");
      return;
    }
    setJoining(true);
    try {
      const { error } = await supabase.rpc("join_chat_group", {
        p_group: groupId,
        p_password: needsPass ? joinPass.trim() : null,
      });
      if (error) throw error;
      toast.success("Joined group!");
      setJoinId(null);
      setJoinPass("");
      void refreshGroups();
      void navigate({ to: "/group/$groupId", params: { groupId } });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not join";
      toast.error(msg.includes("Incorrect password") ? "Incorrect password" : msg);
    } finally {
      setJoining(false);
    }
  }

  async function deleteConversation(peerId: string, peerName: string | null) {
    if (!confirm(`Delete conversation with ${peerName ?? "this student"}? This cannot be undone.`)) return;
    setDeletingPeer(peerId);
    try {
      const { error } = await supabase.rpc("delete_dm_conversation", { peer: peerId });
      if (error) throw error;
      clearDmCache(peerId);
      setDms((d) => d.filter((x) => x.peer_id !== peerId));
      toast.success("Conversation deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingPeer(null);
    }
  }

  const tabBtn =
    "relative flex-1 py-2 rounded-2xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 transition-all";

  return (
    <div className="max-w-md mx-auto px-3 pt-4 pb-4 flex flex-col h-[calc(100dvh-7rem)]">
      <div className="flex items-center gap-1.5 mb-3">
        <button
          onClick={() => setTab("class")}
          className={`${tabBtn} ${tab === "class" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Classroom</span>
          {tab !== "class" && <UnreadBadge count={counts.classroom} className="top-0.5 right-1" />}
        </button>
        <button
          onClick={() => setTab("dms")}
          className={`${tabBtn} ${tab === "dms" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}
        >
          <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Private</span>
          {tab !== "dms" && <UnreadBadge count={counts.dms} className="top-0.5 right-1" />}
        </button>
        <button
          onClick={() => setTab("groups")}
          className={`${tabBtn} ${tab === "groups" ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}
        >
          <UsersRound className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Groups</span>
          {tab !== "groups" && <UnreadBadge count={counts.groups} className="top-0.5 right-1" />}
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
                <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"} animate-fade-up group/msg`}>
                  {!mine &&
                    (m.profiles?.avatar_url ? (
                      <img src={m.profiles.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 mt-auto" />
                    ) : (
                      <div className="h-7 w-7 rounded-full gradient-primary grid place-items-center text-[10px] text-primary-foreground font-bold shrink-0 mt-auto">
                        {name[0]?.toUpperCase()}
                      </div>
                    ))}
                  <div className="relative max-w-[78%]">
                    <div
                      className={`rounded-2xl px-3 py-2 ${mine ? "gradient-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}
                    >
                      {!mine && <div className="text-[10px] font-semibold opacity-70 mb-0.5">{name}</div>}
                      {(m.reply_to_id || m.reply_to_content) && (
                        <div
                          className={`mb-1.5 rounded-xl px-2 py-1.5 text-[11px] border-l-2 ${
                            mine
                              ? "bg-white/15 border-white/50 text-primary-foreground/90"
                              : "bg-muted border-primary/50 text-muted-foreground"
                          }`}
                        >
                          <div className="font-semibold text-[10px] opacity-90">↪ {m.reply_to_name ?? "Student"}</div>
                          <div className="truncate">{m.reply_to_content || "Message"}</div>
                        </div>
                      )}
                      {m.content && <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>}
                      <AttachmentList files={m.attachments} />
                      <div className={`text-[9px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Reply"
                      onClick={() =>
                        setReplyTo({
                          id: m.id,
                          content: m.content || (m.attachments?.length ? "Attachment" : ""),
                          name,
                        })
                      }
                      className={`mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary`}
                    >
                      <Reply className="h-3 w-3" /> Reply
                    </button>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="pt-2 sticky bottom-0">
            {user && (
              <MessageComposer
                userId={user.id}
                onSend={sendClass}
                placeholder="Message the classroom…"
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            )}
          </div>
        </>
      ) : tab === "dms" ? (
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

          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1 pt-2">
            Private messages
          </div>
          {dms.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">No private messages yet.</div>
          )}
          {dms.map((d) => (
            <div
              key={d.peer_id}
              className="flex items-center gap-2 p-3 rounded-2xl bg-card border border-border shadow-card"
            >
              <Link
                to="/dm/$peerId"
                params={{ peerId: d.peer_id }}
                className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-90"
              >
                {d.peer_avatar ? (
                  <img src={d.peer_avatar} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-11 w-11 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold shrink-0">
                    {(d.peer_name ?? "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{d.peer_name ?? "Student"}</div>
                  <div className="text-xs text-muted-foreground truncate">{d.last_message || "Sent an attachment"}</div>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(d.last_at), { addSuffix: true })}
                </div>
              </Link>
              <button
                type="button"
                title="Delete conversation"
                disabled={deletingPeer === d.peer_id}
                onClick={() => void deleteConversation(d.peer_id, d.peer_name)}
                className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
              >
                {deletingPeer === d.peer_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl gradient-primary text-primary-foreground text-sm font-semibold shadow-glow"
          >
            <Plus className="h-4 w-4" /> Create group
          </button>

          {showCreate && (
            <div className="rounded-3xl border border-border bg-card p-4 space-y-2.5 shadow-card animate-pop">
              <div className="text-xs font-semibold">New group chat</div>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Group name"
                className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
              />
              <input
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
              />
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={createPass}
                  onChange={(e) => setCreatePass(e.target.value)}
                  placeholder="Password (optional)"
                  type="password"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Leave password empty for an open group.</p>
              <button
                type="button"
                disabled={creating || createName.trim().length < 2}
                onClick={() => void createGroup()}
                className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-40"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          )}

          {groupsLoading && groups.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">Loading groups…</div>
          )}
          {!groupsLoading && groups.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">No groups yet. Create the first one!</div>
          )}

          {groups.map((g) => (
            <div key={g.id} className="rounded-2xl bg-card border border-border shadow-card p-3.5 space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 grid place-items-center text-white shrink-0 shadow-soft">
                  <UsersRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="font-semibold text-sm truncate">{g.name}</div>
                    {g.has_password && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}
                  </div>
                  {g.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{g.description}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {g.member_count} member{g.member_count === 1 ? "" : "s"}
                    {g.last_message ? ` · ${g.last_message.slice(0, 40)}` : ""}
                  </div>
                </div>
              </div>

              {g.is_member ? (
                <Link
                  to="/group/$groupId"
                  params={{ groupId: g.id }}
                  className="block w-full text-center py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold"
                >
                  Open chat
                </Link>
              ) : joinId === g.id && g.has_password ? (
                <div className="flex gap-2">
                  <input
                    value={joinPass}
                    onChange={(e) => setJoinPass(e.target.value)}
                    type="password"
                    placeholder="Enter password"
                    className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-xs outline-none focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void joinGroup(g.id, true);
                    }}
                  />
                  <button
                    type="button"
                    disabled={joining}
                    onClick={() => void joinGroup(g.id, true)}
                    className="px-3 py-2 rounded-xl bg-foreground text-background text-xs font-semibold disabled:opacity-40"
                  >
                    Join
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => {
                    if (g.has_password) {
                      setJoinId(g.id);
                      setJoinPass("");
                    } else {
                      void joinGroup(g.id, false);
                    }
                  }}
                  className="w-full py-2 rounded-xl bg-muted text-foreground text-xs font-semibold hover:bg-secondary"
                >
                  {g.has_password ? "Enter password to join" : "Join group"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
