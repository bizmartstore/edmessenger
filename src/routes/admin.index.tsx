import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, BookOpen, CalendarCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

interface Report {
  student_id: string;
  full_name: string | null;
  avatar_url: string | null;
  attendance_days: number;
  quizzes_taken: number;
  avg_score: number | null;
}

function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, quizzes: 0, lessons: 0, attendance_today: 0 });
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [s, q, l, a] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("quizzes").select("id", { count: "exact", head: true }),
        supabase.from("lessons").select("id", { count: "exact", head: true }),
        supabase.from("attendance").select("id", { count: "exact", head: true }).eq("date", today),
      ]);
      setStats({
        students: s.count ?? 0,
        quizzes: q.count ?? 0,
        lessons: l.count ?? 0,
        attendance_today: a.count ?? 0,
      });
      const { data: rep } = await supabase.rpc("student_reports");
      setReports((rep ?? []) as Report[]);
    })();
  }, []);

  const tiles = [
    { icon: Users, label: "Students", value: stats.students, color: "from-violet-500 to-fuchsia-500" },
    { icon: ClipboardList, label: "Quizzes", value: stats.quizzes, color: "from-emerald-400 to-teal-500" },
    { icon: BookOpen, label: "Lessons", value: stats.lessons, color: "from-amber-400 to-orange-500" },
    { icon: CalendarCheck, label: "Today", value: stats.attendance_today, color: "from-sky-400 to-indigo-500" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl p-4 bg-card border border-border shadow-card">
            <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${t.color} grid place-items-center mb-2`}>
              <t.icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-2xl font-extrabold">{t.value}</div>
            <div className="text-[11px] text-muted-foreground">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-bold">Student report</h2>
        </div>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
            <div>Student</div><div>Days</div><div>Quizzes</div><div>Avg</div>
          </div>
          {reports.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No student activity yet.</div>}
          {reports.map((r) => (
            <div key={r.student_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded-full gradient-primary grid place-items-center text-[10px] text-primary-foreground font-bold shrink-0">
                    {(r.full_name ?? "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 truncate text-sm font-medium">{r.full_name ?? "Student"}</div>
              </div>
              <div className="text-sm tabular-nums">{r.attendance_days}</div>
              <div className="text-sm tabular-nums">{r.quizzes_taken}</div>
              <div className="text-sm tabular-nums font-semibold">{r.avg_score !== null ? `${Math.round(r.avg_score)}%` : "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
