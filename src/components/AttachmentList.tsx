import { useState } from "react";
import { FileText, Download, ExternalLink, Loader2 } from "lucide-react";
import type { UploadedFile } from "@/lib/upload";
import { downloadFile, humanSize } from "@/lib/upload";
import { toast } from "sonner";

export function AttachmentList({ files }: { files: UploadedFile[] | null | undefined }) {
  const [busy, setBusy] = useState<string | null>(null);

  if (!files || files.length === 0) return null;

  async function handleDownload(f: UploadedFile) {
    setBusy(f.path || f.url);
    try {
      await downloadFile(f.url, f.name);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {files.map((f, i) =>
        f.kind === "image" || f.type?.startsWith("image/") ? (
          <div key={i} className="relative group">
            <a href={f.url} target="_blank" rel="noopener" className="block">
              <img src={f.url} alt={f.name} loading="lazy" className="rounded-xl max-h-64 object-cover w-full" />
            </a>
            <button
              type="button"
              onClick={() => void handleDownload(f)}
              className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-black/55 text-white grid place-items-center opacity-90 hover:opacity-100"
              title="Download"
            >
              {busy === (f.path || f.url) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : (
          <div
            key={i}
            className="flex items-center gap-2 bg-background/60 rounded-xl p-2 border border-border"
          >
            <a
              href={f.url}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-90"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  {f.type?.includes("html") || f.type?.includes("text") ? "text" : f.kind} · {humanSize(f.size)}
                </div>
              </div>
              {f.type?.includes("html") || f.type?.includes("text") ? (
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : null}
            </a>
            <button
              type="button"
              onClick={() => void handleDownload(f)}
              className="h-8 w-8 rounded-lg bg-muted grid place-items-center shrink-0 hover:bg-secondary"
              title="Download"
            >
              {busy === (f.path || f.url) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
        ),
      )}
    </div>
  );
}
