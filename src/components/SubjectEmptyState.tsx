import { Link } from "@tanstack/react-router";
import { BookMarked } from "lucide-react";

export function SubjectEmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 px-4 rounded-2xl bg-card border border-dashed border-border space-y-3">
      <BookMarked className="h-8 w-8 text-muted-foreground mx-auto opacity-60" />
      <div className="text-sm font-semibold">Select a subject first</div>
      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
        Go to My Account and choose your subject to see {label} for that class.
      </p>
      <Link
        to="/profile"
        className="inline-block px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold shadow-glow"
      >
        My Account
      </Link>
    </div>
  );
}
