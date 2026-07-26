import { supabase } from "@/integrations/supabase/client";
import type { UploadedFile } from "@/lib/upload";

export type UploadScope = "wall" | "group";

export interface QuotaStatus {
  images_used: number;
  docs_used: number;
  images_limit: number;
  docs_limit: number;
}

export function countAttachmentKinds(files: UploadedFile[]) {
  let images = 0;
  let docs = 0;
  for (const f of files) {
    if (f.kind === "image" || f.type?.startsWith("image/")) images += 1;
    else docs += 1;
  }
  return { images, docs };
}

export async function fetchUploadQuota(scope: UploadScope): Promise<QuotaStatus> {
  const { data, error } = await supabase.rpc("get_upload_quota", { p_scope: scope });
  if (error || !data) {
    return { images_used: 0, docs_used: 0, images_limit: scope === "wall" ? 5 : 8, docs_limit: scope === "wall" ? 3 : 5 };
  }
  const raw = data as Record<string, number>;
  return {
    images_used: Number(raw.images_used ?? 0),
    docs_used: Number(raw.docs_used ?? 0),
    images_limit: Number(raw.images_limit ?? (scope === "wall" ? 5 : 8)),
    docs_limit: Number(raw.docs_limit ?? (scope === "wall" ? 3 : 5)),
  };
}

/** Reserve daily quota before uploading. Throws with a friendly message on limit. */
export async function consumeUploadQuota(
  scope: UploadScope,
  files: UploadedFile[],
): Promise<QuotaStatus> {
  const { images, docs } = countAttachmentKinds(files);
  if (images === 0 && docs === 0) {
    return fetchUploadQuota(scope);
  }
  const { data, error } = await supabase.rpc("consume_upload_quota", {
    p_scope: scope,
    p_images: images,
    p_docs: docs,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  if (raw.ok === false) {
    throw new Error(String(raw.error ?? "Daily upload limit reached"));
  }
  return {
    images_used: Number(raw.images_used ?? 0),
    docs_used: Number(raw.docs_used ?? 0),
    images_limit: Number(raw.images_limit ?? 0),
    docs_limit: Number(raw.docs_limit ?? 0),
  };
}
