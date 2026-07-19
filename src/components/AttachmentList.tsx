import { FileText, Download } from "lucide-react";
import type { UploadedFile } from "@/lib/upload";
import { humanSize } from "@/lib/upload";

export function AttachmentList({ files }: { files: UploadedFile[] | null | undefined }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {files.map((f, i) => (
        f.kind === "image" ? (
          <a key={i} href={f.url} target="_blank" rel="noopener" className="block">
            <img src={f.url} alt={f.name} loading="lazy" className="rounded-xl max-h-64 object-cover" />
          </a>
        ) : (
          <a
            key={i}
            href={f.url}
            target="_blank"
            rel="noopener"
            download={f.name}
            className="flex items-center gap-2 bg-background/60 rounded-xl p-2 border border-border hover:border-primary/60 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{f.name}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{f.kind} · {humanSize(f.size)}</div>
            </div>
            <Download className="h-4 w-4 text-muted-foreground shrink-0" />
          </a>
        )
      ))}
    </div>
  );
}
