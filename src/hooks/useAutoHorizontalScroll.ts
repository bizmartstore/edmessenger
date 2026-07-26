import { useEffect, useRef } from "react";

/** Slow continuous scrollLeft (content drifts right → left). Pauses while the user swipes/taps. */
export function useAutoHorizontalScroll(enabled = true, speedPxPerFrame = 0.35) {
  const ref = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const tick = () => {
      if (Date.now() >= pausedUntil.current) {
        const half = el.scrollWidth / 2;
        if (half > el.clientWidth) {
          el.scrollLeft += speedPxPerFrame;
          if (el.scrollLeft >= half) {
            el.scrollLeft -= half;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, speedPxPerFrame]);

  const pause = (ms = 2800) => {
    pausedUntil.current = Date.now() + ms;
  };

  return {
    ref,
    pause,
    onPointerDown: () => pause(),
    onTouchStart: () => pause(),
    onWheel: () => pause(),
  } as const;
}
