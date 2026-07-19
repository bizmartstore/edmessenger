import imageCompression from "browser-image-compression";
import { supabase } from "@/integrations/supabase/client";

export interface UploadedFile {
  url: string;
  path: string;
  name: string;
  size: number;
  type: string;
  kind: "image" | "pdf" | "doc" | "ppt" | "xls" | "other";
}

function detectKind(file: File): UploadedFile["kind"] {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (t.startsWith("image/") || n.endsWith(".webp") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png")) return "image";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".doc") || n.endsWith(".docx") || n.endsWith(".html") || n.endsWith(".htm") || t.includes("word") || t.includes("html")) return "doc";
  if (n.endsWith(".ppt") || n.endsWith(".pptx") || t.includes("presentation")) return "ppt";
  if (n.endsWith(".xls") || n.endsWith(".xlsx") || n.endsWith(".csv") || t.includes("spreadsheet") || t.includes("csv")) return "xls";
  return "other";
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "file";
}

/** Convert a canvas/blob image to a small WebP File */
async function toWebpFile(blob: Blob, name: string, quality = 0.72): Promise<File> {
  const bmp = await createImageBitmap(blob);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new File([blob], `${baseName(name)}.jpg`, { type: blob.type || "image/jpeg" });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (webp && webp.size > 0) {
    return new File([webp], `${baseName(name)}.webp`, { type: "image/webp" });
  }
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
  return new File([jpeg ?? blob], `${baseName(name)}.jpg`, { type: "image/jpeg" });
}

async function compressImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.18,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      initialQuality: 0.72,
      fileType: "image/webp",
    });
    const asWebp = compressed.type.includes("webp")
      ? new File([compressed], `${baseName(file.name)}.webp`, { type: "image/webp" })
      : await toWebpFile(compressed, file.name);
    // Cap ~200KB
    if (asWebp.size > 220_000) {
      return toWebpFile(asWebp, file.name, 0.55);
    }
    return asWebp;
  } catch {
    try {
      return await toWebpFile(file, file.name);
    } catch {
      return file;
    }
  }
}

async function docxToHtml(file: File): Promise<File> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buf });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${baseName(file.name)}</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.5;max-width:40rem;margin:1.5rem auto;padding:0 1rem;color:#111}</style>
</head><body><h1>${baseName(file.name)}</h1>${result.value}</body></html>`;
  return new File([html], `${baseName(file.name)}.html`, { type: "text/html;charset=utf-8" });
}

async function sheetToCsv(file: File): Promise<File> {
  // Lightweight: store as UTF-8 text dump of binary is useless; prefer CSV if already CSV,
  // otherwise wrap a note + original name into a tiny HTML viewer stub.
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || file.type.includes("csv")) {
    const text = await file.text();
    return new File([text], `${baseName(file.name)}.csv`, { type: "text/csv;charset=utf-8" });
  }
  // xlsx without a heavy parser: convert to a short HTML notice with download of raw not allowed —
  // extract as base64 is worse for quota. Prefer reading as text if small enough.
  if (file.size < 80_000) {
    try {
      const text = await file.text();
      if (/[\x00-\x08]/.test(text)) throw new Error("binary");
      return new File([text], `${baseName(file.name)}.txt`, { type: "text/plain;charset=utf-8" });
    } catch {
      /* fall through */
    }
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${baseName(file.name)}</title></head>
<body style="font-family:system-ui;padding:1.5rem"><h1>${baseName(file.name)}</h1>
<p>Spreadsheet converted to a compact preview. Re-export as CSV for full fidelity.</p></body></html>`;
  return new File([html], `${baseName(file.name)}.html`, { type: "text/html;charset=utf-8" });
}

async function pdfOrOfficeToLean(file: File): Promise<File> {
  const n = file.name.toLowerCase();
  if (n.endsWith(".docx")) return docxToHtml(file);
  if (n.endsWith(".txt") || file.type === "text/plain") {
    const text = await file.text();
    // Cap text length to protect quota
    const clipped = text.length > 80_000 ? text.slice(0, 80_000) + "\n…(truncated)" : text;
    return new File([clipped], `${baseName(file.name)}.txt`, { type: "text/plain;charset=utf-8" });
  }
  if (n.endsWith(".csv") || n.endsWith(".xls") || n.endsWith(".xlsx")) return sheetToCsv(file);
  if (n.endsWith(".doc") || n.endsWith(".ppt") || n.endsWith(".pptx")) {
    // Legacy Office binary — store a tiny HTML stub instead of megabytes
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${baseName(file.name)}</title></head>
<body style="font-family:system-ui;padding:1.5rem"><h1>${baseName(file.name)}</h1>
<p>This document was optimized for storage. Please re-upload as DOCX, PDF, or images for full viewing.</p>
<p>Original: ${file.name} (${Math.round(file.size / 1024)} KB)</p></body></html>`;
    return new File([html], `${baseName(file.name)}.html`, { type: "text/html;charset=utf-8" });
  }
  if (n.endsWith(".pdf") || file.type === "application/pdf") {
    // Keep PDF only if already small; otherwise refuse oversized originals by wrapping notice
    if (file.size <= 400_000) return file;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${baseName(file.name)}</title></head>
<body style="font-family:system-ui;padding:1.5rem"><h1>${baseName(file.name)}</h1>
<p>PDF was larger than the storage budget (${Math.round(file.size / 1024)} KB). Please export a smaller PDF or share page images instead.</p></body></html>`;
    return new File([html], `${baseName(file.name)}.html`, { type: "text/html;charset=utf-8" });
  }
  if (file.size > 300_000) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${baseName(file.name)}</title></head>
<body style="font-family:system-ui;padding:1.5rem"><h1>${baseName(file.name)}</h1>
<p>File optimized away from storage — original was ${Math.round(file.size / 1024)} KB.</p></body></html>`;
    return new File([html], `${baseName(file.name)}.html`, { type: "text/html;charset=utf-8" });
  }
  return file;
}

/**
 * Convert uploads into lean, viewable formats (WebP / HTML / text)
 * to keep Supabase storage quota low.
 */
export async function processFile(file: File): Promise<File> {
  if (file.type.startsWith("image/")) return compressImage(file);
  return pdfOrOfficeToLean(file);
}

export async function uploadToBucket(
  bucket: string,
  file: File,
  userId: string,
  subdir = ""
): Promise<UploadedFile> {
  const processed = await processFile(file);
  const safeName = processed.name.replace(/[^\w.\-]+/g, "_");
  const ts = Date.now();
  const path = [userId, subdir, `${ts}-${safeName}`].filter(Boolean).join("/");
  const { error } = await supabase.storage.from(bucket).upload(path, processed, {
    cacheControl: "86400",
    upsert: false,
    contentType: processed.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    url: pub.publicUrl,
    path,
    name: file.name,
    size: processed.size,
    type: processed.type,
    kind: detectKind(processed),
  };
}

export function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
