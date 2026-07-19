import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Shows only when the browser can install as a real PWA (beforeinstallprompt).
 * Install button always triggers the native install UI.
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem("edmessenger.pwaDismissed") === "1") return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred || isStandalone()) return null;

  async function install() {
    if (!deferred || busy) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setDeferred(null);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem("edmessenger.pwaDismissed", "1");
    setDeferred(null);
  }

  return (
    <div className="fixed bottom-24 inset-x-0 z-50 px-3 pointer-events-none safe-bottom">
      <div className="pointer-events-auto max-w-md mx-auto glass-card rounded-2xl p-3 flex items-start gap-3 shadow-glow border border-border animate-fade-up">
        <img src="/logo-pwa.png" alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">Install EdMessenger</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Add to your home screen for the full app experience.
          </div>
          <button
            type="button"
            onClick={install}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {busy ? "Installing…" : "Install"}
          </button>
        </div>
        <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-muted shrink-0" aria-label="Dismiss">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
