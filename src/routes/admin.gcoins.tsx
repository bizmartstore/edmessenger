import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Coins, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/gcoins")({
  component: AdminGcoins,
});

type RewardRow = {
  action_key: string;
  amount: number;
  daily_action_cap: number;
};

const DEFAULTS: RewardRow[] = [
  { action_key: "daily_max", amount: 50, daily_action_cap: 50 },
  { action_key: "classroom_message", amount: 1, daily_action_cap: 5 },
  { action_key: "dm_message", amount: 1, daily_action_cap: 5 },
  { action_key: "group_message", amount: 1, daily_action_cap: 5 },
  { action_key: "wall_post", amount: 2, daily_action_cap: 3 },
  { action_key: "feedback", amount: 5, daily_action_cap: 3 },
  { action_key: "complete_activity", amount: 8, daily_action_cap: 5 },
  { action_key: "complete_reviewer", amount: 10, daily_action_cap: 5 },
  { action_key: "view_lesson", amount: 2, daily_action_cap: 8 },
  { action_key: "download_lesson", amount: 3, daily_action_cap: 5 },
];

const LABELS: Record<string, string> = {
  daily_max: "Daily maximum (total)",
  classroom_message: "Classroom message",
  dm_message: "Private message",
  group_message: "Group message",
  wall_post: "Class wall post",
  feedback: "Submit feedback",
  complete_activity: "Complete activity",
  complete_reviewer: "Complete reviewer",
  view_lesson: "View / read lesson",
  download_lesson: "Download lesson",
};

function AdminGcoins() {
  const [rows, setRows] = useState<RewardRow[]>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gcoin_reward_config")
      .select("action_key, amount, daily_action_cap")
      .order("action_key");
    if (error) {
      // Migration may not be applied yet — keep balanced defaults.
      setRows(DEFAULTS);
      if (!/does not exist|schema cache/i.test(error.message)) toast.error(error.message);
    } else if (data?.length) {
      const map = new Map((data as RewardRow[]).map((r) => [r.action_key, r]));
      setRows(
        DEFAULTS.map((d) => map.get(d.action_key) ?? d).concat(
          (data as RewardRow[]).filter((r) => !DEFAULTS.some((d) => d.action_key === r.action_key)),
        ),
      );
    } else {
      setRows(DEFAULTS);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateLocal(key: string, field: "amount" | "daily_action_cap", value: number) {
    setRows((prev) =>
      prev.map((r) => (r.action_key === key ? { ...r, [field]: Math.max(0, Math.min(field === "amount" ? 500 : 100, value)) } : r)),
    );
  }

  async function saveRow(row: RewardRow) {
    setSaving(row.action_key);
    try {
      const { error } = await supabase.rpc("admin_upsert_gcoin_reward", {
        p_key: row.action_key,
        p_amount: row.amount,
        p_cap: row.daily_action_cap,
      });
      if (error) throw error;
      toast.success(`Saved ${LABELS[row.action_key] ?? row.action_key}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed — run GCoins migration?");
    } finally {
      setSaving(null);
    }
  }

  async function resetDefaults() {
    if (!confirm("Reset all GCoin rewards to balanced defaults?")) return;
    setSaving("reset");
    try {
      for (const d of DEFAULTS) {
        const { error } = await supabase.rpc("admin_upsert_gcoin_reward", {
          p_key: d.action_key,
          p_amount: d.amount,
          p_cap: d.daily_action_cap,
        });
        if (error) throw error;
      }
      setRows(DEFAULTS);
      toast.success("Defaults restored");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Coins className="h-5 w-5 text-amber-500 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-lg">GCoins rewards</h1>
          <p className="text-xs text-muted-foreground">
            Optional — leave defaults for a balanced economy. Daily max caps total coins per student per UTC day.
          </p>
        </div>
        <button
          type="button"
          disabled={saving === "reset"}
          onClick={() => void resetDefaults()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-semibold shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Defaults
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.action_key}
              className="rounded-2xl border border-border bg-card p-3.5 shadow-card flex flex-col sm:flex-row sm:items-end gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{LABELS[r.action_key] ?? r.action_key}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{r.action_key}</div>
              </div>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.action_key === "daily_max" ? "Max / day" : "Amount"}
                </span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={r.amount}
                  onChange={(e) => updateLocal(r.action_key, "amount", Number(e.target.value) || 0)}
                  className="mt-1 w-24 px-2.5 py-2 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
                />
              </label>
              {r.action_key !== "daily_max" && (
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Max times / day</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={r.daily_action_cap}
                    onChange={(e) => updateLocal(r.action_key, "daily_action_cap", Number(e.target.value) || 0)}
                    className="mt-1 w-24 px-2.5 py-2 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary"
                  />
                </label>
              )}
              <button
                type="button"
                disabled={saving === r.action_key}
                onClick={() => void saveRow(r)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
