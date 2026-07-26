import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { QUICK_EMOJIS } from "@/lib/emojis";

interface Props {
  onPick: (emoji: string) => void;
  className?: string;
}

export function EmojiPickerButton({ onPick, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2.5 rounded-2xl hover:bg-muted text-muted-foreground shrink-0"
        title="Emoji"
      >
        <Smile className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-40 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-glow p-2 animate-pop">
          <div className="grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="h-8 w-8 rounded-lg text-base hover:bg-muted grid place-items-center"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
