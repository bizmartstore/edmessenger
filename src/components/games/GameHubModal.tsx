import { lazy, Suspense, useEffect, useState } from "react";
import { Gamepad2, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  gamesPasswordRequired,
  hasGamesUnlock,
  rememberGamesUnlock,
  unlockGames,
} from "@/lib/games-access";

const EdgotchiApp = lazy(() =>
  import("@/components/games/edgotchi/EdgotchiApp").then((m) => ({ default: m.EdgotchiApp })),
);

const GotchiTowerApp = lazy(() =>
  import("@/components/games/gotchi-tower/GotchiTowerApp").then((m) => ({ default: m.GotchiTowerApp })),
);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Gate = "checking" | "locked" | "open";

export function GameHubModal({ open, onOpenChange }: Props) {
  const [active, setActive] = useState<"hub" | "edgotchi" | "gotchi-tower">("hub");
  const [gate, setGate] = useState<Gate>("checking");
  const [pass, setPass] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!open) {
      setActive("hub");
      setPass("");
      return;
    }
    let cancelled = false;
    setGate("checking");
    (async () => {
      try {
        const required = await gamesPasswordRequired();
        if (cancelled) return;
        if (!required || hasGamesUnlock()) {
          setGate("open");
        } else {
          setGate("locked");
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          // Before migration is applied, keep games playable
          if (/games_password_required|PGRST202|does not exist|schema cache/i.test(msg)) {
            setGate("open");
          } else {
            setGate("locked");
            toast.error("Could not check game access");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlocking) return;
    setUnlocking(true);
    try {
      const ok = await unlockGames(pass);
      if (!ok) {
        toast.error("Incorrect password");
        return;
      }
      rememberGamesUnlock();
      setGate("open");
      setPass("");
      toast.success("Games unlocked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unlock");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setActive("hub");
          setPass("");
        }
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto rounded-3xl border-border p-4 sm:rounded-3xl">
        {gate === "checking" && (
          <div className="grid min-h-[200px] place-items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Checking access…
          </div>
        )}

        {gate === "locked" && (
          <>
            <DialogHeader className="space-y-1 pr-6 text-left">
              <DialogTitle className="inline-flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-amber-600" /> Games locked
              </DialogTitle>
              <DialogDescription className="text-xs">
                Your teacher set a password. Enter it to play Edgotchi and other games.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => void tryUnlock(e)} className="mt-2 space-y-3">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Game password"
                autoFocus
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={unlocking || !pass.trim()}
                className="w-full rounded-2xl py-3 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow disabled:opacity-40"
              >
                {unlocking ? "Checking…" : "Unlock games"}
              </button>
            </form>
          </>
        )}

        {gate === "open" && active === "hub" && (
          <>
            <DialogHeader className="space-y-1 pr-6 text-left">
              <DialogTitle className="inline-flex items-center gap-2 text-lg">
                <Gamepad2 className="h-5 w-5 text-primary" /> Games
              </DialogTitle>
              <DialogDescription className="text-xs">
                Play student games inside EdMessenger. Progress saves to your account.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={() => setActive("edgotchi")}
                className="group w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-card transition-all hover:shadow-glow active:scale-[0.99]"
              >
                <div className="relative h-36 w-full overflow-hidden">
                  <img
                    src="/games/edgotchi-cover.svg"
                    alt="Edgotchi"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="text-lg font-extrabold tracking-tight text-white">Edgotchi</div>
                    <div className="text-[11px] leading-snug text-white/85">
                      Build a cube pet · explore maps · quiz battles · level up skills
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-xs">
                  <span className="font-semibold text-primary">Play now</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Live
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActive("gotchi-tower")}
                className="group w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-card transition-all hover:shadow-glow active:scale-[0.99]"
              >
                <div className="relative h-36 w-full overflow-hidden">
                  <img
                    src="/games/gotchi-tower-cover.svg"
                    alt="Gotchi Tower"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="text-lg font-extrabold tracking-tight text-white">Gotchi Tower</div>
                    <div className="text-[11px] leading-snug text-white/85">
                      Climb floors · quiz combat · companions · multiplayer PvP
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-xs">
                  <span className="font-semibold text-primary">Enter tower</span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    New
                  </span>
                </div>
              </button>
            </div>
          </>
        )}

        {gate === "open" && active === "edgotchi" && (
          <Suspense
            fallback={<div className="grid min-h-[360px] place-items-center text-sm text-muted-foreground">Loading Edgotchi…</div>}
          >
            <EdgotchiApp onBack={() => setActive("hub")} />
          </Suspense>
        )}

        {gate === "open" && active === "gotchi-tower" && (
          <Suspense
            fallback={<div className="grid min-h-[360px] place-items-center text-sm text-muted-foreground">Loading Gotchi Tower…</div>}
          >
            <GotchiTowerApp onBack={() => setActive("hub")} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
