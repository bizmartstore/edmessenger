import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { useLiveReload } from "@/hooks/useLiveReload";
import { FolderKanban, ChevronRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/activities")({
  component: ActivitiesPage,
});

interface Activity {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
  created_at: string;
}

function ActivitiesPage() {
  const { user } = useAuth();
  const { markRead } = useUnreadBadges();
  const [items, setItems] = useState<Activity[]>([]);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  useEffect(() => {
    void markRead("activities");
  }, [markRead]);

  const loadActivities = useCallback(async () => {
    if (!user) return;
    const [{ data }, { data: subs }] = await Promise.all([
      supabase.from("activities").select("id, title, description, due_at, created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("activity_submissions").select("activity_id").eq("user_id", user.id),
    ]);
    setItems((data ?? []) as Activity[]);
    setSubmitted(new Set((subs ?? []).map((s: { activity_id: string }) => s.activity_id)));
  }, [user]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  useLiveReload("activities-live", [{ table: "activities", event: "INSERT" }], loadActivities, {
    enabled: Boolean(user),
    debounceMs: 800,
  });

  return (
    <div className="max-w-md mx-auto px-5 pt-6 pb-4">
      <header className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center shadow-glow">
          <FolderKanban className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Activities</h1>
          <p className="text-xs text-muted-foreground">Submit your work here</p>
        </div>
      </header>

      {items.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-12">No activities yet.</div>
      )}

      <div className="space-y-3">
        {items.map((a) => {
          const done = submitted.has(a.id);
          return (
            <Link
              key={a.id}
              to="/activities/$id"
              params={{ id: a.id }}
              className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-card hover:shadow-glow transition-all"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  {a.title}
                  {done && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.description || "No description"}</div>
                {a.due_at && (
                  <div className="text-[10px] text-muted-foreground mt-1">Due {format(new Date(a.due_at), "MMM d, yyyy")}</div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
