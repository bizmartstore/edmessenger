import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadToBucket, humanSize } from "@/lib/upload";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/banners")({
  component: AdminBanners,
});

interface Banner {
  id: string;
  image_url: string;
  image_path: string | null;
  sort_order: number;
  created_at: string;
}

function AdminBanners() {
  const { user } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase
      .from("banners")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setBanners((data ?? []) as Banner[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onAdd(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadToBucket("banners", file, user.id);
      const nextOrder = banners.length === 0 ? 0 : Math.max(...banners.map((b) => b.sort_order)) + 1;
      const { error } = await supabase.from("banners").insert({
        image_url: uploaded.url,
        image_path: uploaded.path,
        sort_order: nextOrder,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success(`Banner added (${humanSize(uploaded.size)})`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(b: Banner) {
    if (!confirm("Remove this banner?")) return;
    const { error } = await supabase.from("banners").delete().eq("id", b.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (b.image_path) {
      void supabase.storage.from("banners").remove([b.image_path]);
    }
    toast.success("Banner removed");
    await load();
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Home page image carousel above announcements. Images are compressed automatically and shown to everyone.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl gradient-primary text-primary-foreground text-sm font-semibold shadow-glow disabled:opacity-60"
      >
        <ImagePlus className="h-4 w-4" /> {busy ? "Uploading…" : "Add banner image"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onAdd(e.target.files?.[0])}
      />

      <div className="mt-5 space-y-3">
        {banners.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10 rounded-2xl border border-dashed border-border">
            No banners yet. Add an image to show on the home carousel.
          </div>
        )}
        {banners.map((b, i) => (
          <div key={b.id} className="rounded-2xl bg-card border border-border overflow-hidden shadow-card">
            <img src={b.image_url} alt="" className="w-full h-auto max-h-40 object-contain bg-muted" />
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-muted-foreground">Slide {i + 1}</span>
              <button
                type="button"
                onClick={() => void remove(b)}
                className="p-2 rounded-xl text-red-500 hover:bg-red-500/10"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
