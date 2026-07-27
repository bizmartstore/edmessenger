import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Paperclip,
  Send,
  Trash2,
  X,
  FileText,
  Sparkles,
  MessageCircle,
  SmilePlus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadToBucket, humanSize, type UploadedFile } from "@/lib/upload";
import { consumeUploadQuota, fetchUploadQuota, type QuotaStatus } from "@/lib/upload-quota";
import { AttachmentList } from "@/components/AttachmentList";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { useLiveReload } from "@/hooks/useLiveReload";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { notifyAllExcept, notifyUsers } from "@/lib/push";
import { WALL_FEELINGS, WALL_REACTIONS } from "@/lib/social";
import { ReactionViewersDialog } from "@/components/ReactionViewers";
import { useGcoins } from "@/hooks/useGcoins";
import { chatBackgroundStyle } from "@/lib/store-catalog";

interface WallPost {
  id: string;
  user_id: string;
  content: string;
  attachments: UploadedFile[] | null;
  feeling: string | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

interface WallComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface PostSocial {
  reactions: Record<string, number>;
  my_emoji: string | null;
  comments: WallComment[];
}

const WALL_LIMIT = 40;

export function PostWall() {
  const { user, profile, isAdmin } = useAuth();
  const { wallet, earn } = useGcoins();
  const { markRead, counts } = useUnreadBadges();
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [social, setSocial] = useState<Record<string, PostSocial>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [feeling, setFeeling] = useState<string | null>(null);
  const [pending, setPending] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [reactPicker, setReactPicker] = useState<string | null>(null);
  const [viewersFor, setViewersFor] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wallBg = chatBackgroundStyle(wallet.cosmetics.bg_wall);

  const loadSocial = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setSocial({});
      return;
    }
    const { data, error } = await supabase.rpc("get_wall_social", { p_post_ids: ids });
    if (error || !data) return;
    const raw = data as Record<string, PostSocial>;
    const next: Record<string, PostSocial> = {};
    for (const id of ids) {
      const row = raw[id] ?? { reactions: {}, my_emoji: null, comments: [] };
      next[id] = {
        reactions: (row.reactions as Record<string, number>) ?? {},
        my_emoji: row.my_emoji ?? null,
        comments: (row.comments as WallComment[]) ?? [],
      };
    }
    setSocial(next);
  }, []);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from("wall_posts")
      .select("id, user_id, content, attachments, feeling, created_at")
      .order("created_at", { ascending: false })
      .limit(WALL_LIMIT);
    if (error) {
      // feeling column may not exist yet — fallback
      const fallback = await supabase
        .from("wall_posts")
        .select("id, user_id, content, attachments, created_at")
        .order("created_at", { ascending: false })
        .limit(WALL_LIMIT);
      if (fallback.error) {
        setLoading(false);
        return;
      }
      const rows = ((fallback.data ?? []) as WallPost[]).map((r) => ({ ...r, feeling: r.feeling ?? null }));
      setPosts(await attachProfiles(rows));
      setLoading(false);
      void loadSocial(rows.map((r) => r.id));
      return;
    }
    const rows = (data ?? []) as WallPost[];
    if (rows.length === 0) {
      setPosts([]);
      setSocial({});
      setLoading(false);
      return;
    }
    setPosts(await attachProfiles(rows));
    setLoading(false);
    void loadSocial(rows.map((r) => r.id));
  }, [loadSocial]);

  useEffect(() => {
    void loadPosts();
    void fetchUploadQuota("wall").then(setQuota);
  }, [loadPosts]);

  useEffect(() => {
    const t = window.setTimeout(() => void markRead("wall"), 1500);
    return () => window.clearTimeout(t);
  }, [markRead, posts.length]);

  useLiveReload(
    "wall-live",
    [
      { table: "wall_posts", event: "*" },
      { table: "wall_reactions", event: "*" },
      { table: "wall_comments", event: "*" },
    ],
    loadPosts,
    { debounceMs: 700 },
  );

  async function handleFiles(files: FileList | null) {
    if (!files || !user) return;
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of Array.from(files)) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name} is too large (max 8MB before conversion)`);
          continue;
        }
        const u = await uploadToBucket("chat-files", f, user.id, "wall");
        uploaded.push(u);
      }
      setPending((p) => [...p, ...uploaded]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    if (!user || busy) return;
    if (!text.trim() && pending.length === 0) return;
    setBusy(true);
    try {
      if (pending.length) {
        const next = await consumeUploadQuota("wall", pending);
        setQuota(next);
      }
      const payload: Record<string, unknown> = {
        user_id: user.id,
        content: text.trim(),
        attachments: pending.length ? pending : null,
      };
      if (feeling) payload.feeling = feeling;
      const { error } = await supabase.from("wall_posts").insert(payload);
      if (error) throw error;
      const preview = text.trim() || (pending.length ? "Shared a file" : "New post");
      notifyAllExcept([user.id], `${profile?.full_name ?? "Someone"} on the wall`, preview, "/");
      void earn("wall_post");
      void supabase.rpc("prune_wall_posts");
      setText("");
      setFeeling(null);
      setPending([]);
      setComposerOpen(false);
      toast.success("Posted!");
      void loadPosts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  async function removePost(id: string) {
    const { error } = await supabase.from("wall_posts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPosts((p) => p.filter((x) => x.id !== id));
  }

  async function react(postId: string, emoji: string) {
    const { error } = await supabase.rpc("toggle_wall_reaction", { p_post: postId, p_emoji: emoji });
    if (error) {
      toast.error(error.message);
      return;
    }
    setReactPicker(null);
    void loadSocial(posts.map((p) => p.id));
  }

  async function submitComment(postId: string, authorId: string) {
    if (!user) return;
    const content = (commentDraft[postId] ?? "").trim();
    if (!content) return;
    if (content.length > 500) {
      toast.error("Comment max 500 characters");
      return;
    }
    const { error } = await supabase.from("wall_comments").insert({
      post_id: postId,
      user_id: user.id,
      content,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCommentDraft((d) => ({ ...d, [postId]: "" }));
    void supabase.rpc("prune_wall_comments", { p_post: postId });
    if (authorId !== user.id) {
      notifyUsers([authorId], `${profile?.full_name ?? "Someone"} commented`, content.slice(0, 80), "/");
    }
    void loadSocial(posts.map((p) => p.id));
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from("wall_comments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void loadSocial(posts.map((p) => p.id));
  }

  const totalReactions = (s?: PostSocial) =>
    Object.values(s?.reactions ?? {}).reduce((a, b) => a + Number(b || 0), 0);

  return (
    <section className="mt-6 animate-fade-up">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-base tracking-tight">Class Wall</h2>
            {counts.wall > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
                {counts.wall > 9 ? "9+" : counts.wall}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">React · comment · share vibes</p>
        </div>
        <Sparkles className="h-4 w-4 text-accent" />
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-card overflow-hidden">
        {!composerOpen ? (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/50 transition-colors"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/15" />
            ) : (
              <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground text-sm font-bold">
                {(profile?.full_name ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 rounded-full bg-muted px-4 py-2.5 text-sm text-muted-foreground">
              What&apos;s on your mind?
            </div>
          </button>
        ) : (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">Create post</div>
              <button type="button" onClick={() => setComposerOpen(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {WALL_FEELINGS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setFeeling((cur) => (cur === `${f.emoji} ${f.label}` ? null : `${f.emoji} ${f.label}`))}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border transition-all ${
                    feeling === `${f.emoji} ${f.label}`
                      ? "gradient-primary text-primary-foreground border-transparent shadow-glow"
                      : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={feeling ? `Feeling ${feeling}…` : "Write something for your classmates…"}
              className="w-full resize-none rounded-2xl bg-muted/70 border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            {pending.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pending.map((f, i) => (
                  <div
                    key={i}
                    className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-muted border border-border grid place-items-center"
                  >
                    {f.kind === "image" ? (
                      <img src={f.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center px-1">
                        <FileText className="h-5 w-5 mx-auto text-primary" />
                        <div className="text-[8px] truncate w-16">{f.name}</div>
                        <div className="text-[8px] text-muted-foreground">{humanSize(f.size)}</div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setPending((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {quota && (
              <div className="text-[10px] text-muted-foreground px-0.5">
                Today: {quota.images_used}/{quota.images_limit} images · {quota.docs_used}/{quota.docs_limit} docs
              </div>
            )}
            <div className="flex items-center gap-1 pt-1 border-t border-border">
              <EmojiPickerButton
                onPick={(e) => {
                  setText((t) => t + e);
                  taRef.current?.focus();
                }}
              />
              <button type="button" onClick={() => imgRef.current?.click()} className="p-2 rounded-xl hover:bg-muted text-sky-500" title="Photo">
                <ImageIcon className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="p-2 rounded-xl hover:bg-muted text-amber-600" title="File">
                <Paperclip className="h-5 w-5" />
              </button>
              <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />
              <div className="flex-1" />
              <button
                type="button"
                disabled={busy || uploading || (!text.trim() && pending.length === 0)}
                onClick={() => void publish()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl gradient-primary text-primary-foreground text-sm font-semibold shadow-glow disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> Post
              </button>
            </div>
            {uploading && <div className="text-[10px] text-muted-foreground">Compressing to lean format…</div>}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3 rounded-3xl p-1" style={wallBg}>
        {loading && posts.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">Loading wall…</div>
        )}
        {!loading && posts.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <div className="text-sm font-semibold">No posts yet</div>
            <div className="text-xs text-muted-foreground mt-1">Be the first to share something with the class.</div>
          </div>
        )}
        {posts.map((p) => {
          const name = p.profiles?.full_name ?? "Student";
          const mine = p.user_id === user?.id;
          const s = social[p.id];
          const commentsOpen = openComments[p.id];
          return (
            <article key={p.id} className="rounded-3xl border border-border bg-card shadow-card overflow-hidden animate-fade-up">
              <div className="flex items-center gap-3 p-3.5 pb-2">
                {p.profiles?.avatar_url ? (
                  <img src={p.profiles.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground text-sm font-bold">
                    {name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">
                    {name}
                    {p.feeling && <span className="font-normal text-muted-foreground"> · feeling {p.feeling}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                  </div>
                </div>
                {(mine || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => void removePost(p.id)}
                    className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete post"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {p.content && (
                <div className="px-3.5 pb-2 text-sm whitespace-pre-wrap break-words leading-relaxed">{p.content}</div>
              )}
              <div className="px-3.5 pb-2">
                <AttachmentList files={p.attachments} />
              </div>

              {(totalReactions(s) > 0 || (s?.comments?.length ?? 0) > 0) && (
                <div className="px-3.5 pb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1 flex-wrap">
                    {Object.entries(s?.reactions ?? {})
                      .filter(([, n]) => Number(n) > 0)
                      .sort((a, b) => Number(b[1]) - Number(a[1]))
                      .map(([emoji, n]) => (
                        <button
                          key={emoji}
                          type="button"
                          title="See who reacted"
                          onClick={() => setViewersFor(p.id)}
                          className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 hover:bg-secondary"
                        >
                          {emoji} {n}
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => setOpenComments((o) => ({ ...o, [p.id]: !o[p.id] }))}
                  >
                    {s?.comments?.length ?? 0} comments
                  </button>
                </div>
              )}

              <div className="relative mx-3.5 mb-2 flex border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => setReactPicker((cur) => (cur === p.id ? null : p.id))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-muted ${
                    s?.my_emoji ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <SmilePlus className="h-4 w-4" />
                  {s?.my_emoji ? s.my_emoji : "React"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenComments((o) => ({ ...o, [p.id]: !o[p.id] }))}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground inline-flex items-center justify-center gap-1.5 hover:bg-muted"
                >
                  <MessageCircle className="h-4 w-4" /> Comment
                </button>
                {reactPicker === p.id && (
                  <div className="absolute bottom-full left-0 mb-1 z-20 flex gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-glow animate-pop">
                    {WALL_REACTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => void react(p.id, e)}
                        className={`h-9 w-9 rounded-xl text-lg hover:bg-muted grid place-items-center ${
                          s?.my_emoji === e ? "bg-primary/15 scale-110" : ""
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {commentsOpen && (
                <div className="px-3.5 pb-3.5 space-y-2 border-t border-border pt-2 bg-muted/20">
                  {(s?.comments ?? []).map((c) => (
                    <div key={c.id} className="flex gap-2">
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-full gradient-primary grid place-items-center text-[10px] text-primary-foreground font-bold shrink-0">
                          {(c.full_name ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 rounded-2xl bg-card border border-border px-2.5 py-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[11px] font-semibold">{c.full_name ?? "Student"}</div>
                          {(c.user_id === user?.id || isAdmin) && (
                            <button type="button" onClick={() => void deleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="text-xs whitespace-pre-wrap break-words">{c.content}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      value={commentDraft[p.id] ?? ""}
                      onChange={(e) => setCommentDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitComment(p.id, p.user_id);
                        }
                      }}
                      placeholder="Write a comment…"
                      maxLength={500}
                      className="flex-1 px-3 py-2 rounded-full bg-card border border-border text-xs outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => void submitComment(p.id, p.user_id)}
                      className="h-8 w-8 rounded-full gradient-primary text-primary-foreground grid place-items-center shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <ReactionViewersDialog
        open={Boolean(viewersFor)}
        onOpenChange={(v) => {
          if (!v) setViewersFor(null);
        }}
        source="wall"
        targetId={viewersFor}
        title="Who reacted"
      />
    </section>
  );
}

async function attachProfiles(rows: WallPost[]): Promise<WallPost[]> {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    feeling: r.feeling ?? null,
    profiles: map.get(r.user_id)
      ? { full_name: map.get(r.user_id)!.full_name, avatar_url: map.get(r.user_id)!.avatar_url }
      : null,
  }));
}
