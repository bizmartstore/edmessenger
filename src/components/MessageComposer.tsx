import { useRef, useState } from "react";
import { Paperclip, Send, Image as ImageIcon, X, FileText, Reply } from "lucide-react";
import { uploadToBucket, humanSize, type UploadedFile } from "@/lib/upload";
import { consumeUploadQuota, type UploadScope } from "@/lib/upload-quota";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { toast } from "sonner";

export interface ReplyTarget {
  id: string;
  content: string;
  name: string;
}

interface Props {
  userId: string;
  onSend: (text: string, attachments: UploadedFile[], replyTo?: ReplyTarget | null) => Promise<void>;
  placeholder?: string;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  /** When set, enforce daily image/doc limits after lean conversion upload */
  quotaScope?: UploadScope;
}

export function MessageComposer({
  userId,
  onSend,
  placeholder = "Type a message…",
  replyTo = null,
  onCancelReply,
  quotaScope,
}: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of Array.from(files)) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name} is too large (max 8MB before conversion)`);
          continue;
        }
        // Lean convert (WebP / HTML / text) — same quota-safe pipeline as classroom/DM
        const u = await uploadToBucket("chat-files", f, userId, quotaScope ?? "chat");
        uploaded.push(u);
      }
      setPending((p) => [...p, ...uploaded]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (!text.trim() && pending.length === 0) return;
    setBusy(true);
    try {
      if (quotaScope && pending.length) {
        await consumeUploadQuota(quotaScope, pending);
      }
      await onSend(text.trim(), pending, replyTo);
      setText("");
      setPending([]);
      onCancelReply?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  function insertEmoji(emoji: string) {
    setText((t) => t + emoji);
    taRef.current?.focus();
  }

  return (
    <div className="glass-card rounded-3xl p-2">
      {replyTo && (
        <div className="mx-2 mt-1 mb-1 flex items-start gap-2 rounded-2xl bg-primary/10 border border-primary/20 px-3 py-2">
          <Reply className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-primary">Replying to {replyTo.name}</div>
            <div className="text-xs text-muted-foreground truncate">{replyTo.content || "Attachment"}</div>
          </div>
          <button type="button" onClick={onCancelReply} className="p-0.5 rounded-full hover:bg-muted">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex gap-2 overflow-x-auto p-2 pb-3">
          {pending.map((f, i) => (
            <div
              key={i}
              className="relative shrink-0 rounded-xl overflow-hidden bg-muted border border-border w-20 h-20 grid place-items-center"
            >
              {f.kind === "image" ? (
                <img src={f.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center px-1">
                  <FileText className="h-5 w-5 mx-auto text-primary" />
                  <div className="text-[9px] mt-1 truncate w-16">{f.name}</div>
                  <div className="text-[8px] text-muted-foreground">{humanSize(f.size)}</div>
                </div>
              )}
              <button
                onClick={() => setPending((p) => p.filter((_, idx) => idx !== i))}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                type="button"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-0.5">
        <EmojiPickerButton onPick={insertEmoji} />
        <button
          onClick={() => imgRef.current?.click()}
          className="p-2.5 rounded-2xl hover:bg-muted text-muted-foreground shrink-0"
          type="button"
        >
          <ImageIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2.5 rounded-2xl hover:bg-muted text-muted-foreground shrink-0"
          type="button"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 min-w-0 resize-none bg-transparent outline-none text-sm px-2 py-2.5 max-h-32"
          style={{ minHeight: "40px" }}
        />
        <button
          onClick={() => void submit()}
          disabled={busy || uploading || (!text.trim() && pending.length === 0)}
          className="h-10 w-10 shrink-0 rounded-2xl gradient-primary text-primary-foreground grid place-items-center shadow-glow disabled:opacity-40 disabled:shadow-none"
          type="button"
        >
          <Send className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      {uploading && (
        <div className="text-[10px] text-muted-foreground px-3 pb-1">Compressing to lean format & uploading…</div>
      )}
    </div>
  );
}
