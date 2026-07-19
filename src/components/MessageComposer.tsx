import { useRef, useState } from "react";
import { Paperclip, Send, Image as ImageIcon, X, FileText } from "lucide-react";
import { uploadToBucket, humanSize, type UploadedFile } from "@/lib/upload";
import { toast } from "sonner";

interface Props {
  userId: string;
  onSend: (text: string, attachments: UploadedFile[]) => Promise<void>;
  placeholder?: string;
}

export function MessageComposer({ userId, onSend, placeholder = "Type a message…" }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

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
        const u = await uploadToBucket("chat-files", f, userId);
        uploaded.push(u);
      }
      setPending((p) => [...p, ...uploaded]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  async function submit() {
    if (busy) return;
    if (!text.trim() && pending.length === 0) return;
    setBusy(true);
    try {
      await onSend(text.trim(), pending);
      setText(""); setPending([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally { setBusy(false); }
  }

  return (
    <div className="glass-card rounded-3xl p-2">
      {pending.length > 0 && (
        <div className="flex gap-2 overflow-x-auto p-2 pb-3">
          {pending.map((f, i) => (
            <div key={i} className="relative shrink-0 rounded-xl overflow-hidden bg-muted border border-border w-20 h-20 grid place-items-center">
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
      <div className="flex items-end gap-1">
        <button onClick={() => imgRef.current?.click()} className="p-2.5 rounded-2xl hover:bg-muted text-muted-foreground shrink-0" type="button">
          <ImageIcon className="h-5 w-5" />
        </button>
        <button onClick={() => fileRef.current?.click()} className="p-2.5 rounded-2xl hover:bg-muted text-muted-foreground shrink-0" type="button">
          <Paperclip className="h-5 w-5" />
        </button>
        <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 min-w-0 resize-none bg-transparent outline-none text-sm px-2 py-2.5 max-h-32"
          style={{ minHeight: "40px" }}
        />
        <button
          onClick={submit}
          disabled={busy || uploading || (!text.trim() && pending.length === 0)}
          className="h-10 w-10 shrink-0 rounded-2xl gradient-primary text-primary-foreground grid place-items-center shadow-glow disabled:opacity-40 disabled:shadow-none"
          type="button"
        >
          <Send className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      {uploading && <div className="text-[10px] text-muted-foreground px-3 pb-1">Compressing & uploading…</div>}
    </div>
  );
}
