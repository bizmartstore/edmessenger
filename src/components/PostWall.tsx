import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Paperclip, Send, Trash2, X, FileText, Sparkles } from "lucide-react";
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
import { notifyAllExcept } from "@/lib/push";

interface WallPost {
  id: string;
  user_id: string;
  content: string;
  attachments: UploadedFile[] | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

const WALL_LIMIT = 40;

export function PostWall() {
  const { user, profile, isAdmin } = useAuth();
  const { markRead, counts } = useUnreadBadges();
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from("wall_posts")
      .select("id, user_id, content, attachments, created_at")
      .order("created_at", { ascending: false })
      .limit(WALL_LIMIT);
    if (error) {
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as WallPost[];
    if (rows.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    setPosts(
      rows.map((r) => ({
        ...r,
        profiles: map.get(r.user_id)
          ? { full_name: map.get(r.user_id)!.full_name, avatar_url: map.get(r.user_id)!.avatar_url }
          : null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPosts();
    void fetchUploadQuota("wall").then(setQuota);
  }, [loadPosts]);

  useEffect(() => {
    const t = window.setTimeout(() => void markRead("wall"), 1500);
    return () => window.clearTimeout(t);
  }, [markRead, posts.length]);

  useLiveReload("wall-live", [{ table: "wall_posts", event: "*" }], loadPosts, { debounceMs: 600 });

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
      const { error } = await supabase.from("wall_posts").insert({
        user_id: user.id,
        content: text.trim(),
        attachments: pending.length ? pending : null,
      });
      if (error) throw error;
      const preview = text.trim() || (pending.length ? "Shared a file" : "New post");
      notifyAllExcept([user.id], `${profile?.full_name ?? "Someone"} on the wall`, preview, "/");
      void supabase.rpc("prune_wall_posts");
      setText("");
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
          <p className="text-[11px] text-muted-foreground">Share updates · lean uploads · daily limits</p>
        </div>
        <Sparkles className="h-4 w-4 text-accent" />
      </div>

      {/* Composer trigger / panel */}
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
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Write something for your classmates…"
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
              <button
                type="button"
                onClick={() => imgRef.current?.click()}
                className="p-2 rounded-xl hover:bg-muted text-sky-500"
                title="Photo"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-xl hover:bg-muted text-amber-600"
                title="File"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />
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
            {uploading && (
              <div className="text-[10px] text-muted-foreground">Compressing to lean format…</div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
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
          return (
            <article
              key={p.id}
              className="rounded-3xl border border-border bg-card shadow-card overflow-hidden animate-fade-up"
            >
              <div className="flex items-center gap-3 p-3.5 pb-2">
                {p.profiles?.avatar_url ? (
                  <img src={p.profiles.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground text-sm font-bold">
                    {name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{name}</div>
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
              <div className="px-3.5 pb-3.5">
                <AttachmentList files={p.attachments} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
