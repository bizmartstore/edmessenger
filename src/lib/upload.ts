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
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".doc") || n.endsWith(".docx") || t.includes("word")) return "doc";
  if (n.endsWith(".ppt") || n.endsWith(".pptx") || t.includes("presentation")) return "ppt";
  if (n.endsWith(".xls") || n.endsWith(".xlsx") || t.includes("spreadsheet")) return "xls";
  return "other";
}

export async function processFile(file: File): Promise<File> {
  if (file.type.startsWith("image/")) {
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.82,
      });
      // Preserve original name
      return new File([compressed], file.name, { type: compressed.type });
    } catch {
      return file;
    }
  }
  return file;
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
    cacheControl: "3600",
    upsert: false,
    contentType: processed.type,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    url: pub.publicUrl,
    path,
    name: file.name,
    size: processed.size,
    type: processed.type,
    kind: detectKind(file),
  };
}

export function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
