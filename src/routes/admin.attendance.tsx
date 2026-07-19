import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute("/admin/attendance")({
  component: AdminAttendance,
});

interface Row {
  user_id: string;
  date: string;
  checked_in_at: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Student {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

function AdminAttendance() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [{ data }, { data: all }] = await Promise.all([
      supabase.rpc("attendance_for_date", { d: date }),
      supabase.from("profiles").select("id, full_name, avatar_url").order("full_name").limit(200),
    ]);
    setRows((data ?? []) as Row[]);
    setStudents((all ?? []) as Student[]);
  }

  useEffect(() => {
    load();
  }, [date]);

  async function markPresent(studentId: string) {
    setBusyId(studentId);
    const { error } = await supabase.rpc("admin_mark_attendance", {
      student: studentId,
      d: date,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked present");
    await load();
  }

  const presentIds = new Set(rows.map((r) => r.user_id));
  const filtered = students.filter((s) => {
    if (!query.trim()) return true;
    return (s.full_name ?? "").toLowerCase().includes(query.trim().toLowerCase());
  });

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
          <span className="font-semibold text-foreground">{rows.length}</span> student
          {rows.length === 1 ? "" : "s"} present
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Present today
        </div>
        {rows.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">No check-ins for this day.</div>
        )}
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

      <div className="mt-4 rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Mark students present
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students…"
            className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
          />
        </div>
        {filtered.map((s) => {
          const present = presentIds.has(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
              {s.avatar_url ? (
                <img src={s.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="h-9 w-9 rounded-full gradient-primary grid place-items-center text-[10px] text-primary-foreground font-bold">
                  {(s.full_name ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 font-medium text-sm truncate">{s.full_name ?? "Student"}</div>
              {present ? (
                <span className="text-[10px] font-semibold text-emerald-600">Present</span>
              ) : (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => markPresent(s.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg gradient-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
                >
                  <UserPlus className="h-3 w-3" />
                  {busyId === s.id ? "…" : "Mark"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
