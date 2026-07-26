/** Shared feedback status presentation — display only, no API logic. */

export type FeedbackStatus = "new" | "reviewed" | "planned" | "done" | "archived";

export const FEEDBACK_STATUS_META: Record<
  FeedbackStatus,
  {
    label: string;
    short: string;
    description: string;
    /** Tailwind classes for pill background + text */
    pill: string;
    /** Soft card accent (border / left bar) */
    accent: string;
    icon: "spark" | "eye" | "map" | "check" | "archive";
  }
> = {
  new: {
    label: "Submitted",
    short: "New",
    description: "Waiting for an admin to read your feedback.",
    pill: "bg-sky-500/15 text-sky-700 border-sky-500/30",
    accent: "border-l-sky-500",
    icon: "spark",
  },
  reviewed: {
    label: "Reviewed",
    short: "Reviewed",
    description: "An admin has read your feedback. Thanks for sharing!",
    pill: "bg-violet-500/15 text-violet-700 border-violet-500/30",
    accent: "border-l-violet-500",
    icon: "eye",
  },
  planned: {
    label: "Planned",
    short: "Planned",
    description: "Your idea is on the roadmap — we plan to work on it.",
    pill: "bg-amber-500/15 text-amber-800 border-amber-500/35",
    accent: "border-l-amber-500",
    icon: "map",
  },
  done: {
    label: "Done",
    short: "Done",
    description: "This feedback has been addressed. Great suggestion!",
    pill: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    accent: "border-l-emerald-500",
    icon: "check",
  },
  archived: {
    label: "Archived",
    short: "Archived",
    description: "Kept for history. It may not be pursued right now.",
    pill: "bg-slate-500/15 text-slate-600 border-slate-400/30",
    accent: "border-l-slate-400",
    icon: "archive",
  },
};

export function feedbackStatusMeta(status: string) {
  return FEEDBACK_STATUS_META[status as FeedbackStatus] ?? FEEDBACK_STATUS_META.new;
}
