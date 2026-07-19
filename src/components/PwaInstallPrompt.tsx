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

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem("edmessenger.pwaDismissed") === "1") return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // Show install hint once the app has been opened in the browser
    const t = window.setTimeout(() => {
      if (isIos && isSafari) {
        setIosHint(true);
        setVisible(true);
      } else if (!isStandalone()) {
        // Chromium may fire BIP later; still show a soft prompt
        setVisible(true);
      }
    }, 1800);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(t);
    };
  }, []);

  if (!visible || isStandalone()) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        setDeferred(null);
      }
      return;
    }
    // iOS / browsers without BIP — keep hint visible
    setIosHint(true);
  }

  function dismiss() {
    localStorage.setItem("edmessenger.pwaDismissed", "1");
    setVisible(false);
  }

  return (
    <div className="fixed bottom-24 inset-x-0 z-50 px-3 pointer-events-none safe-bottom">
      <div className="pointer-events-auto max-w-md mx-auto glass-card rounded-2xl p-3 flex items-start gap-3 shadow-glow border border-border animate-fade-up">
        <img src="/logo-pwa.png" alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">Install EdMessenger</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {iosHint
              ? "Tap Share → Add to Home Screen for the full app experience."
              : "Install once for faster access and a home-screen icon."}
          </div>
          {!iosHint && (
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" /> Install app
            </button>
          )}
        </div>
        <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-muted shrink-0" aria-label="Dismiss">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
