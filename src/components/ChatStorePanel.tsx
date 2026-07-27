import { useRef, useState } from "react";
import { Coins, ImagePlus, Check, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useGcoins } from "@/hooks/useGcoins";
import {
  purchaseStoreItem,
  setActiveBubble,
  setChatBackground,
  type ChatSurface,
} from "@/lib/gcoins";
import { STORE_ITEMS, chatBackgroundStyle, type StoreItem } from "@/lib/store-catalog";
import { uploadToBucket } from "@/lib/upload";
import { cn } from "@/lib/utils";

type ShopTab = "bubbles" | "backgrounds" | "apply";

export function ChatStorePanel() {
  const { user } = useAuth();
  const { wallet, refresh, setBalance, setCosmetics } = useGcoins();
  const [shop, setShop] = useState<ShopTab>("bubbles");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applySurface, setApplySurface] = useState<ChatSurface>("classroom");
  const fileRef = useRef<HTMLInputElement>(null);

  const owned = new Set(wallet.cosmetics.owned_items);
  const canCustom = owned.has("bg_custom_unlock");

  async function buy(item: StoreItem) {
    if (busyId || !user) return;
    if (owned.has(item.id)) {
      if (item.kind === "bubble") {
        const ok = await setActiveBubble(item.id);
        if (ok) {
          setCosmetics({ ...wallet.cosmetics, active_bubble: item.id });
          toast.success(`Equipped ${item.name}`);
        }
      }
      return;
    }
    if (wallet.gcoins < item.price) {
      toast.error("Not enough GCoins");
      return;
    }
    setBusyId(item.id);
    try {
      const res = await purchaseStoreItem(item.id);
      if (!res.ok) {
        toast.error(res.reason === "insufficient" ? "Not enough GCoins" : res.reason ?? "Purchase failed");
        return;
      }
      if (res.balance != null) setBalance(res.balance);
      if (res.cosmetics) setCosmetics(res.cosmetics);
      else await refresh();
      toast.success(item.price === 0 ? `Unlocked ${item.name}` : `Bought ${item.name} (−${item.price} GCoins)`);
      if (item.kind === "bubble") {
        await setActiveBubble(item.id);
        setCosmetics({
          ...(res.cosmetics ?? wallet.cosmetics),
          active_bubble: item.id,
          owned_items: res.cosmetics?.owned_items ?? [...wallet.cosmetics.owned_items, item.id],
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusyId(null);
    }
  }

  async function applyBg(value: string | null) {
    setBusyId(`bg-${applySurface}`);
    try {
      const res = await setChatBackground(applySurface, value);
      if (!res.ok) {
        toast.error(
          res.reason === "need_custom_unlock"
            ? "Buy Custom Photo Unlock first"
            : res.reason === "not_owned"
              ? "Purchase this background first"
              : res.reason ?? "Could not apply",
        );
        return;
      }
      const next = { ...wallet.cosmetics };
      if (applySurface === "classroom") next.bg_classroom = value;
      if (applySurface === "dm") next.bg_dm = value;
      if (applySurface === "group") next.bg_group = value;
      if (applySurface === "wall") next.bg_wall = value;
      setCosmetics(next);
      toast.success(value ? "Background applied" : "Background cleared");
    } finally {
      setBusyId(null);
    }
  }

  async function onCustomUpload(file: File | undefined) {
    if (!file || !user) return;
    if (!canCustom) {
      toast.error("Purchase Custom Photo Unlock first");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setBusyId("upload");
    try {
      const up = await uploadToBucket("chat-files", file, user.id, "backgrounds");
      await applyBg(up.url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyId(null);
    }
  }

  const bubbles = STORE_ITEMS.filter((i) => i.kind === "bubble");
  const backgrounds = STORE_ITEMS.filter((i) => i.kind === "background" || i.kind === "pack");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-card">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-600">
            <Coins className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-extrabold tracking-tight">{wallet.gcoins} GCoins</div>
            <div className="text-[11px] text-muted-foreground">
              Today {wallet.daily_earned}/{wallet.daily_cap} earned · Shop with Gotchi Coins
            </div>
          </div>
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="mb-3 flex gap-1 rounded-2xl bg-muted p-1">
        {(
          [
            ["bubbles", "Bubbles"],
            ["backgrounds", "Backgrounds"],
            ["apply", "Apply"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setShop(k)}
            className={cn(
              "flex-1 rounded-xl py-2 text-xs font-semibold transition-all",
              shop === k ? "bg-card shadow-soft text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {shop === "bubbles" &&
          bubbles.map((item) => {
            const isOwned = owned.has(item.id);
            const active = wallet.cosmetics.active_bubble === item.id;
            return (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="flex gap-3">
                  <div className="flex w-24 shrink-0 flex-col gap-1">
                    <div className={cn("rounded-2xl px-2 py-1.5 text-[10px]", item.preview?.mine)}>
                      You
                    </div>
                    <div className={cn("rounded-2xl px-2 py-1.5 text-[10px]", item.preview?.theirs)}>
                      Friend
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="font-semibold text-sm">{item.name}</div>
                      {active && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          <Check className="h-2.5 w-2.5" /> On
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</p>
                    <button
                      type="button"
                      disabled={busyId === item.id || (isOwned && active)}
                      onClick={() => void buy(item)}
                      className={cn(
                        "mt-2 rounded-xl px-3 py-1.5 text-[11px] font-bold",
                        isOwned
                          ? "bg-muted text-foreground"
                          : "gradient-primary text-primary-foreground shadow-glow",
                      )}
                    >
                      {isOwned ? (active ? "Equipped" : "Equip") : item.price === 0 ? "Get free" : `${item.price} GCoins`}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {shop === "backgrounds" &&
          backgrounds.map((item) => {
            const isOwned = owned.has(item.id);
            return (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="flex gap-3">
                  <div
                    className="h-16 w-20 shrink-0 rounded-xl border border-border"
                    style={
                      item.kind === "pack"
                        ? { background: "linear-gradient(135deg,#fbbf24,#f472b6)" }
                        : chatBackgroundStyle(item.id)
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">{item.name}</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</p>
                    <button
                      type="button"
                      disabled={busyId === item.id || isOwned}
                      onClick={() => void buy(item)}
                      className={cn(
                        "mt-2 rounded-xl px-3 py-1.5 text-[11px] font-bold",
                        isOwned ? "bg-muted text-muted-foreground" : "gradient-primary text-primary-foreground shadow-glow",
                      )}
                    >
                      {isOwned ? "Owned" : `${item.price} GCoins`}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {shop === "apply" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Choose where to apply a purchased background. Custom photos need Custom Photo Unlock.
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["classroom", "Classroom"],
                  ["dm", "Private"],
                  ["group", "Groups"],
                  ["wall", "Class Wall"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setApplySurface(k)}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-[11px] font-semibold border",
                    applySurface === k
                      ? "gradient-primary text-primary-foreground border-transparent"
                      : "bg-card border-border text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void applyBg(null)}
              className="w-full rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground"
            >
              Clear background
            </button>

            <div className="grid grid-cols-2 gap-2">
              {STORE_ITEMS.filter((i) => i.kind === "background" && owned.has(i.id)).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void applyBg(item.id)}
                  className="overflow-hidden rounded-2xl border border-border text-left"
                >
                  <div className="h-14 w-full" style={chatBackgroundStyle(item.id)} />
                  <div className="px-2 py-1.5 text-[10px] font-semibold">{item.name}</div>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ImagePlus className="h-4 w-4 text-primary" /> Custom photo
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                {canCustom
                  ? "Upload an image for the selected surface (compressed automatically)."
                  : "Buy Custom Photo Unlock in Backgrounds to enable uploads."}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onCustomUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={!canCustom || busyId === "upload"}
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl gradient-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {busyId === "upload" ? "Uploading…" : "Upload background"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
