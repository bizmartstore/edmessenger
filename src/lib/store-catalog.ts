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
  bg_dots:
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 1px, transparent 0) 0 0 / 16px 16px, hsl(var(--background))",
  bg_grid:
    "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px), hsl(var(--background))",
  bg_waves:
    "repeating-linear-gradient(135deg, rgba(56,189,248,0.08) 0 12px, transparent 12px 24px), hsl(var(--background))",
  bg_stars:
    "radial-gradient(1.5px 1.5px at 20% 30%, rgba(99,102,241,0.45), transparent), radial-gradient(1.5px 1.5px at 70% 60%, rgba(14,165,233,0.4), transparent), radial-gradient(1px 1px at 40% 80%, rgba(168,85,247,0.35), transparent), hsl(var(--background))",
  bg_leaves:
    "radial-gradient(ellipse at 10% 20%, rgba(34,197,94,0.12), transparent 45%), radial-gradient(ellipse at 90% 80%, rgba(16,185,129,0.1), transparent 40%), hsl(var(--background))",
  bg_paper:
    "linear-gradient(180deg, rgba(251,191,36,0.06), transparent 40%), hsl(var(--background))",
  bg_sunset_sky:
    "linear-gradient(180deg, rgba(251,146,60,0.18), rgba(244,114,182,0.12) 45%, hsl(var(--background)) 100%)",
  bg_soft_mesh:
    "radial-gradient(at 20% 20%, rgba(125,211,252,0.25), transparent 50%), radial-gradient(at 80% 0%, rgba(196,181,253,0.22), transparent 45%), radial-gradient(at 50% 100%, rgba(253,186,116,0.18), transparent 50%), hsl(var(--background))",
  bg_confetti:
    "radial-gradient(circle at 15% 20%, rgba(244,63,94,0.18) 0 4px, transparent 5px), radial-gradient(circle at 70% 30%, rgba(59,130,246,0.16) 0 3px, transparent 4px), radial-gradient(circle at 40% 75%, rgba(234,179,8,0.18) 0 3px, transparent 4px), radial-gradient(circle at 85% 70%, rgba(16,185,129,0.15) 0 4px, transparent 5px), hsl(var(--background))",
  bg_chalkboard:
    "linear-gradient(180deg, rgba(22,101,52,0.12), transparent 35%), repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(22,101,52,0.06) 28px), hsl(var(--background))",
  bg_ocean_depth:
    "linear-gradient(180deg, rgba(12,74,110,0.22), rgba(14,116,144,0.12) 40%, hsl(var(--background)) 100%)",
  bg_sakura:
    "radial-gradient(ellipse at 20% 10%, rgba(251,113,133,0.18), transparent 40%), radial-gradient(ellipse at 80% 90%, rgba(244,114,182,0.12), transparent 45%), hsl(var(--background))",
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
  background?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundAttachment?: string;
};

export function chatBackgroundStyle(value: string | null | undefined): BgStyle | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return {
      backgroundImage: `linear-gradient(rgba(255,255,255,0.75), rgba(248,250,252,0.88)), url("${value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "local",
    };
  }
  const preset = BACKGROUND_STYLES[value];
  if (!preset) return undefined;
  if (value === "bg_grid") {
    return { backgroundImage: preset, backgroundSize: "20px 20px, 20px 20px, auto" };
  }
  if (value === "bg_dots") {
    return { backgroundImage: preset };
  }
  return { background: preset };
}
