import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/students")({
  component: AdminStudents,
});

interface Row { id: string; full_name: string | null; email: string | null; avatar_url: string | null; created_at: string }

function AdminStudents() {
  const [students, setStudents] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      setStudents((data ?? []) as Row[]);
    })();
  }, []);

  return (
    <div>
      <div className="text-sm mb-3"><span className="font-bold">{students.length}</span> student{students.length === 1 ? "" : "s"} registered</div>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        {students.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
            {s.avatar_url ? (
              <img src={s.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold">
                {(s.full_name ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{s.full_name ?? "Student"}</div>
              <div className="text-xs text-muted-foreground truncate">{s.email}</div>
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0">Joined {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
