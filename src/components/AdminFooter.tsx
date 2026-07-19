import { useState } from "react";
import { KeyRound, Shield, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function AdminFooter() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, refresh, isAdmin } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { toast.error("Please sign in first"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("redeem_admin_passcode", { passcode: code });
      if (error) throw error;
      if (data === true) {
        toast.success("Admin unlocked");
        await refresh();
        setOpen(false); setCode("");
        navigate({ to: "/admin" });
      } else {
        toast.error("Wrong passcode or email not allowed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast.error(msg);
    } finally { setBusy(false); }
  }

  return (
    <>
      <footer className="text-center py-3 text-[11px] text-muted-foreground">
        <button
          onClick={() => (isAdmin ? navigate({ to: "/admin" }) : setOpen(true))}
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <Shield className="h-3 w-3" />
          {isAdmin ? "Admin dashboard" : "EduChat • Educator access"}
        </button>
      </footer>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fade-up" onClick={() => setOpen(false)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl p-6 shadow-glow animate-pop"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl gradient-primary grid place-items-center">
                  <KeyRound className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <div className="font-semibold">Educator access</div>
                  <div className="text-xs text-muted-foreground">Enter your passcode</div>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              autoFocus
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Passcode"
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border focus:border-primary outline-none text-sm"
            />
            <button
              type="submit"
              disabled={busy || !code}
              className="mt-3 w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 shadow-glow"
            >
              {busy ? "Verifying…" : "Unlock admin"}
            </button>
            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              Only allow-listed emails can redeem the passcode.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
