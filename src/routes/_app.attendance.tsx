import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendancePage,
});

interface Record { id: string; date: string; checked_in_at: string }

function AttendancePage() {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const [records, setRecords] = useState<Record[]>([]);
  const [busy, setBusy] = useState(false);

  const todayRecord = records.find((r) => r.date === today);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("attendance").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30);
      setRecords((data ?? []) as Record[]);
    })();
  }, [user]);

  async function checkIn() {
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.from("attendance").insert({
      user_id: user.id,
      date: today,
    }).select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRecords((p) => [data as Record, ...p]);
    toast.success("You're marked present today ✨");
  }

  return (
    <div className="max-w-md mx-auto px-5 pt-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 grid place-items-center shadow-glow">
          <CalendarCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Attendance</h1>
          <p className="text-xs text-muted-foreground">One tap check-in per day</p>
        </div>
      </header>

      <div className="mt-5 rounded-3xl p-6 gradient-hero text-white shadow-glow text-center">
        <div className="text-xs uppercase tracking-widest opacity-80">Today</div>
        <div className="text-2xl font-extrabold mt-1">{format(new Date(), "EEEE, MMM d")}</div>
        {todayRecord ? (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-semibold">Checked in at {format(new Date(todayRecord.checked_in_at), "p")}</span>
          </div>
        ) : (
          <button
            onClick={checkIn}
            disabled={busy}
            className="mt-4 px-6 py-3 rounded-2xl bg-white text-primary font-bold text-sm shadow-glow disabled:opacity-50"
          >
            {busy ? "Checking in…" : "Check in now"}
          </button>
        )}
      </div>

      <div className="mt-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1 mb-2">History (last 30)</div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 30 }).map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = format(d, "yyyy-MM-dd");
            const has = records.some((r) => r.date === key);
            return (
              <div
                key={key}
                title={key}
                className={`aspect-square rounded-lg grid place-items-center text-[10px] font-semibold ${has ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {format(d, "d")}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Present <span className="font-semibold text-foreground">{records.length}</span> day{records.length === 1 ? "" : "s"} this month.
        </div>
      </div>
    </div>
  );
}
