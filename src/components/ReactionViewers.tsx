import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { rememberProfiles } from "@/lib/profile-cache";

export type ReactorRow = {
  user_id: string;
  emoji: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string;
};

type Source = "wall" | "classroom" | "group";

const RPC: Record<Source, string> = {
  wall: "list_wall_reactors",
  classroom: "list_classroom_msg_reactors",
  group: "list_group_msg_reactors",
};

const PARAM: Record<Source, string> = {
  wall: "p_post",
  classroom: "p_msg",
  group: "p_msg",
};

/** Lazy-loaded “who reacted” dialog — fetches only when opened (1 RPC). */
export function ReactionViewersDialog({
  open,
  onOpenChange,
  source,
  targetId,
  title = "Reactions",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: Source;
  targetId: string | null;
  title?: string;
}) {
  const [rows, setRows] = useState<ReactorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !targetId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      const { data, error } = await supabase.rpc(RPC[source], { [PARAM[source]]: targetId });
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        const parsed = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
        const list = (Array.isArray(parsed) ? parsed : []) as ReactorRow[];
        setRows(list);
        rememberProfiles(
          list.map((r) => ({
            id: r.user_id,
            full_name: r.full_name,
            avatar_url: r.avatar_url,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, targetId, source]);

  const byEmoji = rows.reduce<Record<string, ReactorRow[]>>((acc, r) => {
    (acc[r.emoji] ??= []).push(r);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl p-4 sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        {loading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
        {err && <div className="py-4 text-center text-xs text-destructive">{err}</div>}
        {!loading && !err && rows.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No reactions yet</div>
        )}
        {!loading && rows.length > 0 && (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {Object.entries(byEmoji).map(([emoji, list]) => (
              <div key={emoji}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="text-lg">{emoji}</span>
                  <span className="text-muted-foreground text-xs">{list.length}</span>
                </div>
                <ul className="space-y-2">
                  {list.map((r) => (
                    <li key={`${r.user_id}-${r.emoji}`} className="flex items-center gap-2.5">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="grid h-8 w-8 place-items-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground">
                          {(r.full_name ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="truncate text-sm font-medium">{r.full_name ?? "Student"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
