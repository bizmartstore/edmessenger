import { useMemo, useState } from "react";
import { Eraser, Paintbrush } from "lucide-react";
import { PALETTE, VOXEL_COLS, VOXEL_ROWS, MAX_VOXELS, type Voxel } from "@/lib/edgotchi";
import { cn } from "@/lib/utils";

type Props = {
  initial?: Voxel[];
  onChange: (voxels: Voxel[]) => void;
};

export function VoxelPainter({ initial = [], onChange }: Props) {
  const [voxels, setVoxels] = useState<Voxel[]>(initial);
  const [color, setColor] = useState(0);
  const [erase, setErase] = useState(false);

  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of voxels) m.set(`${v.x},${v.y}`, v.c);
    return m;
  }, [voxels]);

  function paint(x: number, y: number) {
    setVoxels((prev) => {
      const key = `${x},${y}`;
      const next = prev.filter((v) => `${v.x},${v.y}` !== key);
      if (!erase) {
        if (next.length >= MAX_VOXELS && !prev.some((v) => `${v.x},${v.y}` === key)) return prev;
        next.push({ x, y, c: color });
      }
      onChange(next);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {PALETTE.map((hex, i) => (
          <button
            key={hex}
            type="button"
            onClick={() => {
              setColor(i);
              setErase(false);
            }}
            className={cn(
              "h-7 w-7 rounded-lg border-2 transition-transform",
              color === i && !erase ? "scale-110 border-foreground" : "border-transparent",
            )}
            style={{ background: hex }}
            aria-label={`Color ${i + 1}`}
          />
        ))}
        <button
          type="button"
          onClick={() => setErase(false)}
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold",
            !erase ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Paintbrush className="h-3 w-3" /> Draw
        </button>
        <button
          type="button"
          onClick={() => setErase(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold",
            erase ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Eraser className="h-3 w-3" /> Erase
        </button>
      </div>

      <div
        className="mx-auto grid w-fit gap-0.5 rounded-2xl bg-slate-900/90 p-2 shadow-inner touch-none select-none"
        style={{ gridTemplateColumns: `repeat(${VOXEL_COLS}, 1.65rem)` }}
        onPointerLeave={() => undefined}
      >
        {Array.from({ length: VOXEL_ROWS * VOXEL_COLS }, (_, i) => {
          const x = i % VOXEL_COLS;
          const y = Math.floor(i / VOXEL_COLS);
          const c = map.get(`${x},${y}`);
          return (
            <button
              key={`${x}-${y}`}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                paint(x, y);
              }}
              onPointerEnter={(e) => {
                if (e.buttons === 1) paint(x, y);
              }}
              className="h-[1.65rem] w-[1.65rem] rounded-md border border-white/10"
              style={{ background: c != null ? PALETTE[c] : "rgba(255,255,255,0.06)" }}
            />
          );
        })}
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        {voxels.length}/{MAX_VOXELS} cubes · paint your permanent Edgotchi
      </p>
    </div>
  );
}

export function VoxelPreview({ voxels, size = 8 }: { voxels: Voxel[]; size?: number }) {
  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of voxels) m.set(`${v.x},${v.y}`, v.c);
    return m;
  }, [voxels]);

  return (
    <div
      className="grid gap-px rounded-xl bg-slate-900 p-1.5"
      style={{ gridTemplateColumns: `repeat(${VOXEL_COLS}, ${size}px)` }}
    >
      {Array.from({ length: VOXEL_ROWS * VOXEL_COLS }, (_, i) => {
        const x = i % VOXEL_COLS;
        const y = Math.floor(i / VOXEL_COLS);
        const c = map.get(`${x},${y}`);
        return (
          <div
            key={`${x}-${y}`}
            style={{
              width: size,
              height: size,
              background: c != null ? PALETTE[c] : "transparent",
              borderRadius: 2,
            }}
          />
        );
      })}
    </div>
  );
}
