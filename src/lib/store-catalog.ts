/** Client store catalog — prices mirrored in SUPABASE_MIGRATION_GCOINS_STORE.sql */

export type StoreItemKind = "bubble" | "background" | "pack";

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  price: number;
  kind: StoreItemKind;
  /** Preview classes / CSS variables for bubbles */
  preview?: {
    mine: string;
    theirs: string;
  };
  /** CSS background for preset backgrounds */
  bgStyle?: string;
}

export const BUBBLE_STYLES: Record<
  string,
  { mine: string; theirs: string }
> = {
  bubble_classic: {
    mine: "gradient-primary text-primary-foreground rounded-br-md",
    theirs: "bg-card border border-border rounded-bl-md",
  },
  bubble_ocean: {
    mine: "bg-gradient-to-br from-sky-500 to-blue-700 text-white rounded-br-md shadow-sm",
    theirs: "bg-sky-50 border border-sky-200 text-sky-950 rounded-bl-md dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-50",
  },
  bubble_sunset: {
    mine: "bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-600 text-white rounded-br-md",
    theirs: "bg-orange-50 border border-orange-200 text-orange-950 rounded-bl-md dark:bg-orange-950/30 dark:border-orange-800",
  },
  bubble_mint: {
    mine: "bg-gradient-to-br from-emerald-400 to-teal-600 text-white rounded-br-md",
    theirs: "bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-bl-md dark:bg-emerald-950/30 dark:border-emerald-800",
  },
  bubble_lavender: {
    mine: "bg-gradient-to-br from-violet-400 to-indigo-600 text-white rounded-br-md",
    theirs: "bg-violet-50 border border-violet-200 text-violet-950 rounded-bl-md dark:bg-violet-950/30 dark:border-violet-800",
  },
  bubble_candy: {
    mine: "bg-gradient-to-br from-pink-400 via-rose-400 to-red-400 text-white rounded-br-2xl rounded-br-md",
    theirs: "bg-pink-50 border border-pink-200 text-pink-950 rounded-bl-2xl rounded-bl-md dark:bg-pink-950/30",
  },
  bubble_neon: {
    mine: "bg-zinc-900 text-lime-300 border border-lime-400/60 rounded-br-md shadow-[0_0_12px_rgba(163,230,53,0.35)]",
    theirs: "bg-zinc-900/90 text-cyan-200 border border-cyan-400/50 rounded-bl-md",
  },
  bubble_ink: {
    mine: "bg-slate-900 text-slate-50 rounded-br-md border border-slate-700",
    theirs: "bg-slate-100 border border-slate-300 text-slate-900 rounded-bl-md dark:bg-slate-800 dark:text-slate-50",
  },
  bubble_peach: {
    mine: "bg-gradient-to-br from-amber-200 to-orange-300 text-amber-950 rounded-br-md",
    theirs: "bg-amber-50 border border-amber-200 text-amber-950 rounded-bl-md",
  },
  bubble_aurora: {
    mine: "bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 text-white rounded-br-md",
    theirs: "bg-gradient-to-br from-cyan-50 to-purple-50 border border-cyan-200 text-slate-900 rounded-bl-md dark:from-cyan-950/40 dark:to-purple-950/40",
  },
  bubble_glass: {
    mine: "bg-white/25 backdrop-blur-md text-white border border-white/40 rounded-br-md shadow-sm",
    theirs: "bg-white/70 backdrop-blur-md border border-white/60 text-foreground rounded-bl-md dark:bg-white/10",
  },
  bubble_comic: {
    mine: "bg-yellow-300 text-black border-2 border-black rounded-br-md shadow-[3px_3px_0_#000]",
    theirs: "bg-white text-black border-2 border-black rounded-bl-md shadow-[3px_3px_0_#000]",
  },
  bubble_forest: {
    mine: "bg-gradient-to-br from-lime-500 to-green-800 text-white rounded-br-md",
    theirs: "bg-lime-50 border border-lime-200 text-lime-950 rounded-bl-md dark:bg-lime-950/30 dark:border-lime-800",
  },
  bubble_rose: {
    mine: "bg-gradient-to-br from-rose-300 to-rose-600 text-white rounded-br-md",
    theirs: "bg-rose-50 border border-rose-200 text-rose-950 rounded-bl-md dark:bg-rose-950/30",
  },
  bubble_midnight: {
    mine: "bg-gradient-to-br from-indigo-900 to-slate-950 text-indigo-100 rounded-br-md border border-indigo-500/40",
    theirs: "bg-indigo-950/80 text-indigo-100 border border-indigo-700/50 rounded-bl-md",
  },
  bubble_honey: {
    mine: "bg-gradient-to-br from-yellow-400 to-amber-600 text-amber-950 rounded-br-md",
    theirs: "bg-yellow-50 border border-yellow-200 text-amber-950 rounded-bl-md",
  },
  bubble_bubblegum: {
    mine: "bg-gradient-to-br from-fuchsia-400 to-pink-500 text-white rounded-[1.25rem] rounded-br-md",
    theirs: "bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-950 rounded-[1.25rem] rounded-bl-md dark:bg-fuchsia-950/30",
  },
};

export const BACKGROUND_STYLES: Record<string, string> = {
  // Kept for catalog metadata; rendering uses BACKGROUND_PRESETS via chatBackgroundStyle().
  bg_dots: "dot paper",
  bg_grid: "notebook grid",
  bg_waves: "diagonal waves",
  bg_stars: "starfield",
  bg_leaves: "green leaves",
  bg_paper: "warm paper",
  bg_sunset_sky: "sunset sky",
  bg_soft_mesh: "soft mesh",
  bg_confetti: "confetti",
  bg_chalkboard: "chalkboard",
  bg_ocean_depth: "ocean depth",
  bg_sakura: "sakura",
};

/** Visible, correctly layered presets (color + image + size). */
export type BgPreset = {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
};

export const BACKGROUND_PRESETS: Record<string, BgPreset> = {
  bg_dots: {
    backgroundColor: "#e2e8f0",
    backgroundImage: "radial-gradient(circle, #475569 1.5px, transparent 1.6px)",
    backgroundSize: "12px 12px",
    backgroundPosition: "0 0",
  },
  bg_grid: {
    backgroundColor: "#f8fafc",
    backgroundImage:
      "linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)",
    backgroundSize: "18px 18px, 18px 18px",
  },
  bg_waves: {
    backgroundColor: "#e0f2fe",
    backgroundImage: "repeating-linear-gradient(135deg, #38bdf8 0 10px, transparent 10px 22px)",
    backgroundSize: "auto",
  },
  bg_stars: {
    backgroundColor: "#0f172a",
    backgroundImage:
      "radial-gradient(1.5px 1.5px at 12% 22%, #a5b4fc, transparent), radial-gradient(1.5px 1.5px at 68% 38%, #38bdf8, transparent), radial-gradient(1.2px 1.2px at 42% 72%, #e879f9, transparent), radial-gradient(1px 1px at 88% 18%, #fde68a, transparent), radial-gradient(1.2px 1.2px at 28% 88%, #67e8f9, transparent)",
    backgroundSize: "100% 100%",
  },
  bg_leaves: {
    backgroundColor: "#ecfdf5",
    backgroundImage:
      "radial-gradient(ellipse at 12% 18%, rgba(34,197,94,0.45), transparent 42%), radial-gradient(ellipse at 88% 78%, rgba(16,185,129,0.38), transparent 40%), radial-gradient(ellipse at 55% 40%, rgba(132,204,22,0.22), transparent 35%)",
    backgroundSize: "100% 100%",
  },
  bg_paper: {
    backgroundColor: "#fef3c7",
    backgroundImage:
      "linear-gradient(180deg, rgba(251,191,36,0.35), transparent 50%), repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(180,83,9,0.12) 24px)",
    backgroundSize: "auto, 100% 24px",
  },
  bg_sunset_sky: {
    backgroundColor: "#fff7ed",
    backgroundImage: "linear-gradient(180deg, #fb923c 0%, #f472b6 42%, #fdba74 70%, #ffedd5 100%)",
    backgroundSize: "100% 100%",
  },
  bg_soft_mesh: {
    backgroundColor: "#f1f5f9",
    backgroundImage:
      "radial-gradient(at 18% 22%, rgba(56,189,248,0.55), transparent 50%), radial-gradient(at 82% 8%, rgba(167,139,250,0.5), transparent 45%), radial-gradient(at 50% 95%, rgba(251,146,60,0.45), transparent 50%)",
    backgroundSize: "100% 100%",
  },
  bg_confetti: {
    backgroundColor: "#fdf4ff",
    backgroundImage:
      "radial-gradient(circle at 12% 18%, #f43f5e 0 3px, transparent 4px), radial-gradient(circle at 72% 28%, #3b82f6 0 3px, transparent 4px), radial-gradient(circle at 38% 70%, #eab308 0 3px, transparent 4px), radial-gradient(circle at 86% 68%, #10b981 0 3.5px, transparent 4.5px), radial-gradient(circle at 52% 42%, #a855f7 0 2.5px, transparent 3.5px), radial-gradient(circle at 22% 88%, #f97316 0 3px, transparent 4px)",
    backgroundSize: "100% 100%",
  },
  bg_chalkboard: {
    backgroundColor: "#14532d",
    backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 40%), repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(255,255,255,0.12) 27px)",
    backgroundSize: "auto, 100% 27px",
  },
  bg_ocean_depth: {
    backgroundColor: "#0c4a6e",
    backgroundImage: "linear-gradient(180deg, #0369a1 0%, #0e7490 35%, #155e75 70%, #082f49 100%)",
    backgroundSize: "100% 100%",
  },
  bg_sakura: {
    backgroundColor: "#fff1f2",
    backgroundImage:
      "radial-gradient(ellipse at 18% 12%, rgba(251,113,133,0.55), transparent 42%), radial-gradient(ellipse at 82% 88%, rgba(244,114,182,0.4), transparent 45%), radial-gradient(circle at 48% 48%, rgba(253,164,175,0.3), transparent 40%)",
    backgroundSize: "100% 100%",
  },
};

export const STORE_ITEMS: StoreItem[] = [
  {
    id: "bubble_classic",
    name: "Classic",
    description: "Default EdMessenger bubbles",
    price: 0,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_classic,
  },
  {
    id: "bubble_ocean",
    name: "Ocean",
    description: "Cool blue waves",
    price: 25,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_ocean,
  },
  {
    id: "bubble_sunset",
    name: "Sunset",
    description: "Warm orange-to-pink glow",
    price: 25,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_sunset,
  },
  {
    id: "bubble_mint",
    name: "Mint Fresh",
    description: "Calm emerald tones",
    price: 30,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_mint,
  },
  {
    id: "bubble_lavender",
    name: "Lavender",
    description: "Soft violet chat",
    price: 30,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_lavender,
  },
  {
    id: "bubble_candy",
    name: "Candy Pop",
    description: "Playful pink bubbles",
    price: 40,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_candy,
  },
  {
    id: "bubble_neon",
    name: "Neon Night",
    description: "Dark mode with neon edges",
    price: 50,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_neon,
  },
  {
    id: "bubble_ink",
    name: "Ink",
    description: "Bold slate contrast",
    price: 45,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_ink,
  },
  {
    id: "bubble_peach",
    name: "Peach Soft",
    description: "Gentle amber pastel",
    price: 35,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_peach,
  },
  {
    id: "bubble_aurora",
    name: "Aurora",
    description: "Northern lights blend",
    price: 60,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_aurora,
  },
  {
    id: "bubble_glass",
    name: "Glass",
    description: "Frosted translucent look",
    price: 55,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_glass,
  },
  {
    id: "bubble_comic",
    name: "Comic",
    description: "Bold outline pop-art",
    price: 50,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_comic,
  },
  {
    id: "bubble_forest",
    name: "Forest",
    description: "Deep green woodland",
    price: 35,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_forest,
  },
  {
    id: "bubble_rose",
    name: "Rose Garden",
    description: "Soft rose petals",
    price: 35,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_rose,
  },
  {
    id: "bubble_midnight",
    name: "Midnight",
    description: "Late-night study vibes",
    price: 55,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_midnight,
  },
  {
    id: "bubble_honey",
    name: "Honey",
    description: "Warm golden glow",
    price: 30,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_honey,
  },
  {
    id: "bubble_bubblegum",
    name: "Bubblegum",
    description: "Round playful pops",
    price: 40,
    kind: "bubble",
    preview: BUBBLE_STYLES.bubble_bubblegum,
  },
  {
    id: "bg_dots",
    name: "Dot Paper",
    description: "Subtle dotted backdrop",
    price: 20,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_dots,
  },
  {
    id: "bg_grid",
    name: "Notebook Grid",
    description: "Light graph paper",
    price: 20,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_grid,
  },
  {
    id: "bg_waves",
    name: "Diagonal Waves",
    description: "Soft stripe rhythm",
    price: 30,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_waves,
  },
  {
    id: "bg_stars",
    name: "Starfield",
    description: "Twinkling study night",
    price: 35,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_stars,
  },
  {
    id: "bg_leaves",
    name: "Green Leaves",
    description: "Fresh nature wash",
    price: 30,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_leaves,
  },
  {
    id: "bg_paper",
    name: "Warm Paper",
    description: "Cozy parchment feel",
    price: 25,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_paper,
  },
  {
    id: "bg_sunset_sky",
    name: "Sunset Sky",
    description: "Golden hour gradient",
    price: 40,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_sunset_sky,
  },
  {
    id: "bg_soft_mesh",
    name: "Soft Mesh",
    description: "Modern color blobs",
    price: 45,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_soft_mesh,
  },
  {
    id: "bg_confetti",
    name: "Confetti",
    description: "Celebration speckles",
    price: 35,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_confetti,
  },
  {
    id: "bg_chalkboard",
    name: "Chalkboard",
    description: "Classroom board lines",
    price: 40,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_chalkboard,
  },
  {
    id: "bg_ocean_depth",
    name: "Ocean Depth",
    description: "Deep blue calm",
    price: 40,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_ocean_depth,
  },
  {
    id: "bg_sakura",
    name: "Sakura",
    description: "Soft cherry blossom wash",
    price: 45,
    kind: "background",
    bgStyle: BACKGROUND_STYLES.bg_sakura,
  },
  {
    id: "bg_custom_unlock",
    name: "Custom Photo Unlock",
    description: "Upload your own background image for any chat surface",
    price: 80,
    kind: "pack",
  },
];

export function bubbleClasses(bubbleId: string | null | undefined, mine: boolean): string {
  const style = BUBBLE_STYLES[bubbleId || "bubble_classic"] ?? BUBBLE_STYLES.bubble_classic;
  return mine ? style.mine : style.theirs;
}

export type BgStyle = {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundAttachment?: string;
};

export function chatBackgroundStyle(value: string | null | undefined): BgStyle | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return {
      backgroundColor: "#f8fafc",
      backgroundImage: `linear-gradient(rgba(255,255,255,0.55), rgba(248,250,252,0.72)), url("${value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "local",
    };
  }
  const preset = BACKGROUND_PRESETS[value];
  if (!preset) return undefined;
  return {
    backgroundColor: preset.backgroundColor,
    backgroundImage: preset.backgroundImage,
    backgroundSize: preset.backgroundSize ?? "auto",
    backgroundPosition: preset.backgroundPosition ?? "0 0",
    backgroundRepeat: preset.backgroundRepeat ?? "repeat",
  };
}
