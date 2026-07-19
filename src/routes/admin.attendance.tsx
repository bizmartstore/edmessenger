import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export const Route = createFileRoute("/admin/attendance")({
  component: AdminAttendance,
});

interface Row { user_id: string; date: string; checked_in_at: string; full_name: string | null; avatar_url: string | null }

function AdminAttendance() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("attendance_for_date", { d: date });
      setRows((data ?? []) as Row[]);
    })();
  }, [date]);

  return (
    <div>
      <div className="rounded-2xl p-4 bg-card border border-border shadow-card">
        <div className="text-xs text-muted-foreground mb-1">Choose a date</div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
        />
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{rows.length}</span> student{rows.length === 1 ? "" : "s"} checked in
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-card border border-border overflow-hidden">
        {rows.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No check-ins for this day.</div>}
        {rows.map((r) => (
          <div key={r.user_id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
            {r.avatar_url ? (
              <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-full gradient-primary grid place-items-center text-[10px] text-primary-foreground font-bold">
                {(r.full_name ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{r.full_name ?? "Student"}</div>
              <div className="text-[10px] text-muted-foreground">{format(new Date(r.checked_in_at), "p")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
