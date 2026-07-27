import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Gamepad2, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  gamesPasswordRequired,
  hasGamesUnlock,
  rememberGamesUnlock,
  unlockGames,
} from "@/lib/games-access";

const EdgotchiApp = lazy(() =>
  import("@/components/games/edgotchi/EdgotchiApp").then((m) => ({ default: m.EdgotchiApp })),
);

export const Route = createFileRoute("/_app/games")({
  component: GamesPage,
});

type Gate = "checking" | "locked" | "open";

function GamesPage() {
  const [active, setActive] = useState<"hub" | "edgotchi">("hub");
  const [gate, setGate] = useState<Gate>("checking");
  const [pass, setPass] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
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
  }, []);

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
    <div className="max-w-md mx-auto px-4 pt-4 pb-6 md:max-w-none md:w-full md:px-0">
      {gate === "checking" && (
        <div className="grid min-h-[50vh] place-items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Checking access…
        </div>
      )}

      {gate === "locked" && (
        <div className="space-y-4">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Games locked</h1>
              <p className="text-xs text-muted-foreground">
                Your teacher set a password. Enter it to play Edgotchi and other games.
              </p>
            </div>
          </header>
          <form onSubmit={(e) => void tryUnlock(e)} className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-card">
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
        </div>
      )}

      {gate === "open" && active === "hub" && (
        <div className="space-y-4">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-glow">
              <Gamepad2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Games</h1>
              <p className="text-xs text-muted-foreground">
                Play student games inside EdMessenger. Progress saves to your account.
              </p>
            </div>
          </header>

          <button
            type="button"
            onClick={() => setActive("edgotchi")}
            className="group w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-card transition-all hover:shadow-glow active:scale-[0.99]"
          >
            <div className="relative h-44 w-full overflow-hidden">
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
        </div>
      )}

      {gate === "open" && active === "edgotchi" && (
        <Suspense
          fallback={<div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading Edgotchi…</div>}
        >
          <EdgotchiApp onBack={() => setActive("hub")} />
        </Suspense>
      )}
    </div>
  );
}
