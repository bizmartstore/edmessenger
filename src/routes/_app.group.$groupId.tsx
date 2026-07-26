import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, LogOut, UsersRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageComposer } from "@/components/MessageComposer";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import {
  appendGroupCache,
  getGroupCache,
  MSG_LIMIT,
  removeGroupCache,
  setGroupCache,
  type GroupMsg,
} from "@/lib/chat-cache";
import { getCachedProfile, rememberProfile, rememberProfiles } from "@/lib/profile-cache";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { notifyUsers } from "@/lib/push";
import { fetchUploadQuota, type QuotaStatus } from "@/lib/upload-quota";

export const Route = createFileRoute("/_app/group/$groupId")({
  component: GroupChatPage,
});

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  has_password: boolean;
  member_count: number;
  is_member: boolean;
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
  const { markRead } = useUnreadBadges();
  const navigate = useNavigate();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [msgs, setMsgs] = useState<GroupMsg[]>(() => getGroupCache(groupId));
  const [loading, setLoading] = useState(() => getGroupCache(groupId).length === 0);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [joinPass, setJoinPass] = useState("");
  const [joining, setJoining] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void markRead("groups");
  }, [markRead, groupId]);

  const loadInfo = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_chat_groups");
    if (error) return;
    const list = (data ?? []) as GroupInfo[];
    const g = list.find((x) => x.id === groupId) ?? null;
    setInfo(g);
    return g;
  }, [groupId]);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("group_messages")
      .select("id, group_id, user_id, content, attachments, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(MSG_LIMIT);
    if (error) {
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
    } else {
      setGroupCache(groupId, []);
      setMsgs([]);
    }
    setLoading(false);
  }, [groupId, user]);

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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, user, info?.is_member]);

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

  async function send(text: string, attachments: UploadedFile[]) {
    if (!user) return;
    const { data, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        user_id: user.id,
        content: text,
        attachments: attachments.length ? attachments : null,
      })
      .select("id, group_id, user_id, content, attachments, created_at")
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
      void fetchUploadQuota("group").then(setQuota);
    }
    void supabase.rpc("prune_group_messages", { p_group: groupId });
  }

  if (!info && !loading) {
    return (
      <div className="max-w-md mx-auto px-4 pt-8 text-center space-y-3">
        <div className="text-sm font-semibold">Group not found</div>
        <Link to="/chat" className="text-sm text-primary font-medium">
          ← Back to chat
        </Link>
      </div>
    );
  }

  if (info && !info.is_member) {
    return (
      <div className="max-w-md mx-auto px-4 pt-4 pb-4">
        <header className="flex items-center gap-3 pb-4">
          <Link to="/chat" className="p-2 -ml-2 rounded-xl hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="font-semibold text-sm">Join group</div>
        </header>
        <div className="rounded-3xl border border-border bg-card shadow-card p-6 text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 grid place-items-center text-white shadow-glow">
            <UsersRound className="h-7 w-7" />
          </div>
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
    <div className="max-w-md mx-auto px-4 pt-4 pb-4 flex flex-col h-[calc(100dvh-7rem)]">
      <header className="flex items-center gap-3 pb-3 border-b border-border">
        <Link to="/chat" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 grid place-items-center text-white shrink-0">
          <UsersRound className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate flex items-center gap-1">
            {info?.name ?? "Group"}
            {info?.has_password && <Lock className="h-3 w-3 text-amber-500" />}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {info?.member_count ?? "…"} members · latest {MSG_LIMIT}
            {quota ? ` · ${quota.images_used}/${quota.images_limit} img today` : ""}
          </div>
        </div>
        <button type="button" onClick={() => void leave()} className="p-2 rounded-xl hover:bg-muted text-muted-foreground" title="Leave group">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-3">
        {loading && msgs.length === 0 && <div className="text-center text-xs text-muted-foreground py-10">Loading…</div>}
        {!loading && msgs.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">No messages yet. Start the conversation!</div>
        )}
        {msgs.map((m) => {
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
                className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? "gradient-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}
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
        {user && info?.is_member && (
          <MessageComposer
            userId={user.id}
            onSend={send}
            placeholder={`Message ${info.name}…`}
            quotaScope="group"
          />
        )}
      </div>
    </div>
  );
}
