import { lazy, Suspense, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const EdgotchiApp = lazy(() =>
  import("@/components/games/edgotchi/EdgotchiApp").then((m) => ({ default: m.EdgotchiApp })),
);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GameHubModal({ open, onOpenChange }: Props) {
  const [active, setActive] = useState<"hub" | "edgotchi">("hub");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setActive("hub");
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto rounded-3xl border-border p-4 sm:rounded-3xl">
        {active === "hub" ? (
          <>
            <DialogHeader className="space-y-1 pr-6 text-left">
              <DialogTitle className="inline-flex items-center gap-2 text-lg">
                <Gamepad2 className="h-5 w-5 text-primary" /> Games
              </DialogTitle>
              <DialogDescription className="text-xs">
                Play student games inside EdMessenger. Progress saves to your account.
              </DialogDescription>
            </DialogHeader>

            <button
              type="button"
              onClick={() => setActive("edgotchi")}
              className="group mt-2 w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-card transition-all hover:shadow-glow active:scale-[0.99]"
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
          </>
        ) : (
          <Suspense
            fallback={<div className="grid min-h-[360px] place-items-center text-sm text-muted-foreground">Loading Edgotchi…</div>}
          >
            <EdgotchiApp onBack={() => setActive("hub")} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
