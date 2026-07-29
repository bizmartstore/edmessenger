import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Lock,
  LogOut,
  UsersRound,
  Pin,
  BarChart3,
  Sparkles,
  Trash2,
  X,
  Reply,
  ClipboardList,
  Camera,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageComposer, type ReplyTarget } from "@/components/MessageComposer";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import { uploadGroupAvatar } from "@/lib/upload";
import {
  appendGroupCache,
  getGroupCache,
  MSG_LIMIT,
  patchGroupCache,
  removeGroupCache,
  setGroupCache,
  type GroupMsg,
} from "@/lib/chat-cache";
import { getCachedProfile, rememberProfile, rememberProfiles } from "@/lib/profile-cache";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { notifyUsers } from "@/lib/push";
import { fetchUploadQuota, type QuotaStatus } from "@/lib/upload-quota";
import { GROUP_ICEBREAKERS, GROUP_REACTIONS } from "@/lib/social";
import { GroupQuizzesPanel } from "@/components/GroupQuizzesPanel";
import { ReactionViewersDialog } from "@/components/ReactionViewers";
import { useGcoins } from "@/hooks/useGcoins";
import { bubbleClasses, chatBackgroundStyle } from "@/lib/store-catalog";

export const Route = createFileRoute("/_app/group/$groupId")({
  component: GroupChatPage,
});

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  has_password: boolean;
  avatar_url?: string | null;
  member_count: number;
  is_member: boolean;
  created_by?: string;
  pinned_message_id?: string | null;
}

interface PollResults {
  poll_id: string;
  question: string;
  options: string[];
  my_vote: number | null;
  counts: number[];
}

async function resolveProfile(userId: string) {
  const cached = getCachedProfile(userId);
  if (cached) return cached;
  const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
  if (p) rememberProfile(userId, p);
  return p ?? null;
}

function GroupChatPage() {
  const { groupId } = Route.useParams();
  const { user, profile } = useAuth();
  const { wallet, earn } = useGcoins();
  const { markRead } = useUnreadBadges();
  const navigate = useNavigate();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [msgs, setMsgs] = useState<GroupMsg[]>(() => getGroupCache(groupId));
  const [loading, setLoading] = useState(() => getGroupCache(groupId).length === 0);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [joinPass, setJoinPass] = useState("");
  const [joining, setJoining] = useState(false);
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [polls, setPolls] = useState<Record<string, PollResults>>({});
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState(["", ""]);
  const [pinnedPreview, setPinnedPreview] = useState<GroupMsg | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [viewersFor, setViewersFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bubbleId = wallet.cosmetics.active_bubble;
  const groupBg = chatBackgroundStyle(wallet.cosmetics.bg_group);

  useEffect(() => {
    void markRead("groups");
  }, [markRead, groupId]);

  const loadInfo = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_chat_groups");
    if (error) return;
    const list = (data ?? []) as GroupInfo[];
    const g = list.find((x) => x.id === groupId) ?? null;
    // pinned_message_id may live on chat_groups — fetch lightly
    if (g) {
      const { data: row } = await supabase
        .from("chat_groups")
        .select("pinned_message_id")
        .eq("id", groupId)
        .maybeSingle();
      g.pinned_message_id = (row as { pinned_message_id?: string | null } | null)?.pinned_message_id ?? null;
    }
    setInfo(g);
    return g;
  }, [groupId]);

  const loadReactions = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await supabase.rpc("get_group_msg_reactions", { p_ids: ids });
    if (data) setReactions(data as Record<string, Record<string, number>>);
  }, []);

  const loadPoll = useCallback(async (pollId: string) => {
    const { data } = await supabase.rpc("get_group_poll_results", { p_poll: pollId });
    if (data) {
      setPolls((p) => ({ ...p, [pollId]: data as PollResults }));
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("group_messages")
      .select("id, group_id, user_id, content, attachments, created_at, deleted_at, msg_type, meta, reply_to_id, reply_to_content, reply_to_name")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(MSG_LIMIT);
    if (error) {
      // columns may not exist yet
      const fb = await supabase
        .from("group_messages")
        .select("id, group_id, user_id, content, attachments, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(MSG_LIMIT);
      if (fb.error) {
        setLoading(false);
        return;
      }
      const rows = ((fb.data ?? []) as GroupMsg[]).reverse();
      setGroupCache(groupId, rows);
      setMsgs(rows);
      setLoading(false);
      return;
    }
    const rows = ((data ?? []) as GroupMsg[]).reverse();
    if (rows.length) {
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      rememberProfiles((profiles ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      const withP = rows.map((r) => ({
        ...r,
        profiles: map.get(r.user_id)
          ? { full_name: map.get(r.user_id)!.full_name, avatar_url: map.get(r.user_id)!.avatar_url }
          : null,
      }));
      setGroupCache(groupId, withP);
      setMsgs(withP);
      void loadReactions(withP.map((m) => m.id));
      for (const m of withP) {
        const pollId = (m.meta as { poll_id?: string } | null)?.poll_id;
        if (m.msg_type === "poll" && pollId) void loadPoll(pollId);
      }
    } else {
      setGroupCache(groupId, []);
      setMsgs([]);
    }
    setLoading(false);
  }, [groupId, user, loadReactions, loadPoll]);

  useEffect(() => {
    void (async () => {
      const g = await loadInfo();
      if (g?.is_member) {
        await loadMessages();
        void fetchUploadQuota("group").then(setQuota);
      } else {
        setLoading(false);
      }
    })();
  }, [loadInfo, loadMessages]);

  useEffect(() => {
    if (!info?.pinned_message_id) {
      setPinnedPreview(null);
      return;
    }
    const local = msgs.find((m) => m.id === info.pinned_message_id);
    if (local) {
      setPinnedPreview(local);
      return;
    }
    void supabase
      .from("group_messages")
      .select("id, group_id, user_id, content, attachments, created_at, deleted_at, msg_type, meta")
      .eq("id", info.pinned_message_id)
      .maybeSingle()
      .then(({ data }) => setPinnedPreview((data as GroupMsg) ?? null));
  }, [info?.pinned_message_id, msgs]);

  useEffect(() => {
    if (!user || !info?.is_member) return;
    const ch = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const row = payload.new as GroupMsg;
          const p = await resolveProfile(row.user_id);
          setMsgs([...appendGroupCache(groupId, { ...row, profiles: p })]);
          const pollId = (row.meta as { poll_id?: string } | null)?.poll_id;
          if (row.msg_type === "poll" && pollId) void loadPoll(pollId);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as GroupMsg;
          setMsgs([...patchGroupCache(groupId, row.id, row)]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const id = (payload.old as { id?: string })?.id;
          if (id) setMsgs([...removeGroupCache(groupId, id)]);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "group_poll_votes" }, () => {
        const cached = getGroupCache(groupId);
        for (const m of cached) {
          const pollId = (m.meta as { poll_id?: string } | null)?.poll_id;
          if (m.msg_type === "poll" && pollId) void loadPoll(pollId);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_msg_reactions" }, () => {
        void loadReactions(getGroupCache(groupId).map((m) => m.id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, user, info?.is_member, loadPoll, loadReactions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function join() {
    if (!info) return;
    setJoining(true);
    try {
      const { error } = await supabase.rpc("join_chat_group", {
        p_group: groupId,
        p_password: info.has_password ? joinPass.trim() : null,
      });
      if (error) throw error;
      toast.success("Joined!");
      const g = await loadInfo();
      if (g?.is_member) {
        await loadMessages();
        void fetchUploadQuota("group").then(setQuota);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not join";
      toast.error(msg.includes("Incorrect password") ? "Incorrect password" : msg);
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    if (!confirm("Leave this group?")) return;
    const { error } = await supabase.rpc("leave_chat_group", { p_group: groupId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Left group");
    navigate({ to: "/chat" });
  }

  async function onGroupAvatar(file: File | undefined) {
    if (!file || !user || !info || info.created_by !== user.id) return;
    setAvatarUploading(true);
    try {
      const url = await uploadGroupAvatar(groupId, file);
      setInfo((prev) => (prev ? { ...prev, avatar_url: url } : prev));
      // Refresh list metadata so Groups tab shows the new photo
      void loadInfo();
      toast.success("Group photo updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  }

  const isOwner = Boolean(user && info?.created_by === user.id);

  function GroupAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
    const cls =
      size === "lg"
        ? "h-14 w-14 rounded-2xl"
        : size === "sm"
          ? "h-9 w-9 rounded-xl"
          : "h-11 w-11 rounded-2xl";
    const iconCls = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
    if (info?.avatar_url) {
      return (
        <img
          key={info.avatar_url}
          src={info.avatar_url}
          alt=""
          className={`${cls} object-cover shrink-0 shadow-soft bg-muted`}
        />
      );
    }
    return (
      <div
        className={`${cls} bg-gradient-to-br from-teal-400 to-emerald-600 grid place-items-center text-white shrink-0 shadow-soft`}
      >
        <UsersRound className={iconCls} />
      </div>
    );
  }

  async function send(text: string, attachments: UploadedFile[], reply?: ReplyTarget | null) {
    if (!user) return;
    const { data, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        user_id: user.id,
        content: text,
        attachments: attachments.length ? attachments : null,
        msg_type: "text",
        reply_to_id: reply?.id ?? null,
        reply_to_content: reply ? (reply.content || "Attachment").slice(0, 160) : null,
        reply_to_name: reply?.name ?? null,
      })
      .select("id, group_id, user_id, content, attachments, created_at, deleted_at, msg_type, meta, reply_to_id, reply_to_content, reply_to_name")
      .single();
    if (error) throw error;
    if (data) {
      rememberProfile(user.id, {
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      });
      setMsgs([
        ...appendGroupCache(groupId, {
          ...(data as GroupMsg),
          profiles: { full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null },
        }),
      ]);
      const preview = text.trim() || (attachments.length ? "Sent an attachment" : "New message");
      const { data: memberIds } = await supabase.rpc("get_group_member_ids", { p_group: groupId });
      const ids = ((memberIds as string[] | null) ?? []).filter((id) => id !== user.id);
      if (ids.length) {
        notifyUsers(ids, `${info?.name ?? "Group"} · ${profile?.full_name ?? "Someone"}`, preview, `/group/${groupId}`);
      }
      void earn("group_message");
      void fetchUploadQuota("group").then(setQuota);
    }
    void supabase.rpc("prune_group_messages", { p_group: groupId });
  }

  async function softDelete(id: string) {
    if (!confirm("Remove this message? Members will see that you removed it.")) return;
    const { error } = await supabase.rpc("soft_delete_group_message", { p_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMsgs([
      ...patchGroupCache(groupId, id, {
        deleted_at: new Date().toISOString(),
        content: "",
        attachments: null,
        meta: null,
        reply_to_content: null,
      }),
    ]);
  }

  async function react(msgId: string, emoji: string) {
    const { error } = await supabase.rpc("toggle_group_msg_reaction", { p_msg: msgId, p_emoji: emoji });
    if (error) {
      toast.error(error.message);
      return;
    }
    setReactFor(null);
    void loadReactions(msgs.map((m) => m.id));
  }

  async function pin(msgId: string | null) {
    const { error } = await supabase.rpc("pin_group_message", { p_group: groupId, p_message: msgId });
    if (error) {
      toast.error(error.message);
      return;
    }
    setInfo((i) => (i ? { ...i, pinned_message_id: msgId } : i));
    toast.success(msgId ? "Pinned" : "Unpinned");
  }

  async function sendIcebreaker() {
    const line = GROUP_ICEBREAKERS[Math.floor(Math.random() * GROUP_ICEBREAKERS.length)];
    await send(`🧊 Icebreaker: ${line}`, []);
    setToolsOpen(false);
  }

  async function createPoll() {
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (pollQ.trim().length < 2 || opts.length < 2) {
      toast.error("Need a question and at least 2 options");
      return;
    }
    const { error } = await supabase.rpc("create_group_poll", {
      p_group: groupId,
      p_question: pollQ.trim(),
      p_options: opts,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPollOpen(false);
    setPollQ("");
    setPollOpts(["", ""]);
    setToolsOpen(false);
    toast.success("Poll posted!");
    void loadMessages();
  }

  async function vote(pollId: string, idx: number) {
    const { error } = await supabase.rpc("vote_group_poll", { p_poll: pollId, p_option: idx });
    if (error) {
      toast.error(error.message);
      return;
    }
    void loadPoll(pollId);
  }

  if (!info && !loading) {
    return (
      <div className="max-w-md mx-auto px-4 pt-8 text-center space-y-3 md:max-w-none md:w-full md:px-0">
        <div className="text-sm font-semibold">Group not found</div>
        <Link to="/chat" className="text-sm text-primary font-medium">
          ← Back to chat
        </Link>
      </div>
    );
  }

  if (info && !info.is_member) {
    return (
      <div className="max-w-md mx-auto px-4 pt-4 pb-4 md:max-w-none md:w-full md:px-0">
        <header className="flex items-center gap-3 pb-4">
          <Link to="/chat" className="p-2 -ml-2 rounded-xl hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="font-semibold text-sm">Join group</div>
        </header>
        <div className="rounded-3xl border border-border bg-card shadow-card p-6 text-center space-y-3">
          <GroupAvatar size="lg" />
          <div className="font-extrabold text-lg">{info.name}</div>
          {info.description && <p className="text-sm text-muted-foreground">{info.description}</p>}
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            {info.has_password && <Lock className="h-3 w-3 text-amber-500" />}
            {info.member_count} members · {info.has_password ? "Password required" : "Open group"}
          </div>
          {info.has_password && (
            <input
              value={joinPass}
              onChange={(e) => setJoinPass(e.target.value)}
              type="password"
              placeholder="Group password"
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-sm outline-none focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") void join();
              }}
            />
          )}
          <button
            type="button"
            disabled={joining || (info.has_password && !joinPass.trim())}
            onClick={() => void join()}
            className="w-full py-3 rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-40"
          >
            {joining ? "Joining…" : "Join & chat"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-4 flex flex-col h-[calc(100dvh-7rem)] md:max-w-none md:w-full md:px-0 md:h-[calc(100dvh-1.5rem)]">
      <header className="flex items-center gap-3 pb-3 border-b border-border">
        <Link to="/chat" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {isOwner ? (
          <button
            type="button"
            disabled={avatarUploading}
            onClick={() => avatarRef.current?.click()}
            className="relative shrink-0 group"
            title="Change group photo"
          >
            <GroupAvatar size="sm" />
            <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-card border border-border shadow grid place-items-center group-hover:bg-muted">
              <Camera className="h-2.5 w-2.5 text-primary" />
            </span>
          </button>
        ) : (
          <GroupAvatar size="sm" />
        )}
        <input
          ref={avatarRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onGroupAvatar(e.target.files?.[0])}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate flex items-center gap-1">
            {info?.name ?? "Group"}
            {info?.has_password && <Lock className="h-3 w-3 text-amber-500" />}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {info?.member_count ?? "…"} members · text tools only
            {quota ? ` · ${quota.images_used}/${quota.images_limit} img` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setToolsOpen((o) => !o)}
          className="p-2 rounded-xl hover:bg-muted text-primary"
          title="Group tools"
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void leave()} className="p-2 rounded-xl hover:bg-muted text-muted-foreground" title="Leave group">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {toolsOpen && (
        <div className="mt-2 rounded-2xl border border-border bg-card p-3 shadow-card space-y-2 animate-pop">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fun tools · no extra quota</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void sendIcebreaker()}
              className="py-2.5 rounded-xl bg-muted text-xs font-semibold hover:bg-secondary"
            >
              🧊 Icebreaker
            </button>
            <button
              type="button"
              onClick={() => setPollOpen((o) => !o)}
              className="py-2.5 rounded-xl bg-muted text-xs font-semibold hover:bg-secondary inline-flex items-center justify-center gap-1"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Quick poll
            </button>
            <button
              type="button"
              onClick={() => {
                setQuizOpen(true);
                setToolsOpen(false);
              }}
              className="col-span-2 py-2.5 rounded-xl bg-muted text-xs font-semibold hover:bg-secondary inline-flex items-center justify-center gap-1"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Group quizzes
            </button>
          </div>
          {pollOpen && (
            <div className="space-y-2 pt-1 border-t border-border">
              <input
                value={pollQ}
                onChange={(e) => setPollQ(e.target.value)}
                placeholder="Poll question"
                maxLength={200}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs outline-none focus:border-primary"
              />
              {pollOpts.map((o, i) => (
                <input
                  key={i}
                  value={o}
                  onChange={(e) => setPollOpts((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                  maxLength={80}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs outline-none focus:border-primary"
                />
              ))}
              {pollOpts.length < 4 && (
                <button type="button" onClick={() => setPollOpts((o) => [...o, ""])} className="text-[11px] text-primary font-medium">
                  + Add option
                </button>
              )}
              <button
                type="button"
                onClick={() => void createPoll()}
                className="w-full py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold"
              >
                Post poll
              </button>
            </div>
          )}
        </div>
      )}

      {pinnedPreview && !pinnedPreview.deleted_at && (
        <div className="mt-2 rounded-2xl border border-amber-400/40 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 flex items-start gap-2">
          <Pin className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-amber-700">Pinned</div>
            <div className="text-xs truncate">{pinnedPreview.content || "Attachment / poll"}</div>
          </div>
          <button type="button" onClick={() => void pin(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-3 rounded-2xl" style={groupBg}>
        {loading && msgs.length === 0 && <div className="text-center text-xs text-muted-foreground py-10">Loading…</div>}
        {!loading && msgs.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">No messages yet. Try an icebreaker!</div>
        )}
        {msgs.map((m) => {
          const mine = m.user_id === user?.id;
          const name = m.profiles?.full_name ?? "Student";
          const removed = Boolean(m.deleted_at);
          const pollId = (m.meta as { poll_id?: string } | null)?.poll_id;
          const poll = pollId ? polls[pollId] : null;
          const rx = reactions[m.id] ?? {};
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
              <div className="max-w-[82%] relative">
                <div
                  className={`rounded-2xl px-3 py-2 ${
                    removed
                      ? "bg-muted/60 border border-dashed border-border text-muted-foreground"
                      : bubbleClasses(bubbleId, mine)
                  }`}
                >
                  {!mine && !removed && <div className="text-[10px] font-semibold opacity-70 mb-0.5">{name}</div>}
                  {removed ? (
                    <div className="text-xs italic">This message was removed by {mine ? "you" : name}.</div>
                  ) : m.msg_type === "poll" && poll ? (
                    <div className="space-y-2 min-w-[12rem]">
                      <div className="text-sm font-semibold flex items-center gap-1">
                        <BarChart3 className="h-3.5 w-3.5" /> {poll.question}
                      </div>
                      {poll.options.map((opt, idx) => {
                        const total = poll.counts.reduce((a, b) => a + Number(b || 0), 0) || 1;
                        const cnt = Number(poll.counts[idx] ?? 0);
                        const pct = Math.round((cnt / total) * 100);
                        const selected = poll.my_vote === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => void vote(poll.poll_id, idx)}
                            className={`relative w-full text-left rounded-xl overflow-hidden border text-xs px-2.5 py-2 ${
                              mine
                                ? selected
                                  ? "border-white/60 bg-white/20"
                                  : "border-white/25 bg-white/10"
                                : selected
                                  ? "border-primary bg-primary/10"
                                  : "border-border bg-muted/50"
                            }`}
                          >
                            <div
                              className={`absolute inset-y-0 left-0 ${mine ? "bg-white/25" : "bg-primary/15"}`}
                              style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex justify-between gap-2">
                              <span className="font-medium">{opt}</span>
                              <span className="opacity-70">{pct}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                  <div className={`text-[9px] mt-1 ${mine && !removed ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </div>
                </div>

                {!removed && Object.keys(rx).length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
                    {Object.entries(rx).map(([e, n]) => (
                      <button
                        key={e}
                        type="button"
                        title="See who reacted"
                        onClick={() => setViewersFor(m.id)}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          void react(m.id, e);
                        }}
                        className="text-[11px] rounded-full bg-card border border-border px-1.5 py-0.5 shadow-soft"
                      >
                        {e} {n}
                      </button>
                    ))}
                  </div>
                )}

                {!removed && (
                  <div className={`mt-1 flex items-center gap-2 relative ${mine ? "justify-end" : "justify-start"}`}>
                    <button type="button" onClick={() => setReactFor((c) => (c === m.id ? null : m.id))} className="text-[10px] text-primary font-medium">
                      React
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setReplyTo({
                          id: m.id,
                          content: m.content || (m.attachments?.length ? "Attachment" : m.msg_type === "poll" ? "Poll" : ""),
                          name,
                        })
                      }
                      className="text-[10px] text-primary font-medium inline-flex items-center gap-0.5"
                    >
                      <Reply className="h-3 w-3" /> Reply
                    </button>
                    <button type="button" onClick={() => void pin(m.id)} className="text-[10px] text-muted-foreground font-medium inline-flex items-center gap-0.5">
                      <Pin className="h-3 w-3" /> Pin
                    </button>
                    {mine && (
                      <button type="button" onClick={() => void softDelete(m.id)} className="text-[10px] text-muted-foreground hover:text-destructive font-medium inline-flex items-center gap-0.5">
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                    {reactFor === m.id && (
                      <div className={`absolute bottom-full mb-1 z-20 flex gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-glow animate-pop ${mine ? "right-0" : "left-0"}`}>
                        {GROUP_REACTIONS.map((e) => (
                          <button key={e} type="button" onClick={() => void react(m.id, e)} className="h-8 w-8 rounded-xl text-base hover:bg-muted grid place-items-center">
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="pt-2 sticky bottom-0">
        {user && info?.is_member && (
          <MessageComposer
            userId={user.id}
            onSend={send}
            placeholder={`Message ${info.name}…`}
            quotaScope="group"
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
          />
        )}
      </div>
      {quizOpen && user && info && (
        <GroupQuizzesPanel
          groupId={groupId}
          groupName={info.name}
          userId={user.id}
          isOwner={info.created_by === user.id}
          onClose={() => setQuizOpen(false)}
        />
      )}
      <ReactionViewersDialog
        open={Boolean(viewersFor)}
        onOpenChange={(v) => {
          if (!v) setViewersFor(null);
        }}
        source="group"
        targetId={viewersFor}
        title="Who reacted"
      />
    </div>
  );
}
