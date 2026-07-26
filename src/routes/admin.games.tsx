import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Gamepad2, Lock, LockOpen, Shield } from "lucide-react";
import { toast } from "sonner";
import { clearGamesUnlock, gamesPasswordRequired, setGamesPassword } from "@/lib/games-access";

export const Route = createFileRoute("/admin/games")({
  component: AdminGames,
});

function AdminGames() {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLocked(await gamesPasswordRequired());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load game lock");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function savePassword() {
    if (saving) return;
    if (password.trim().length > 0 && password.trim().length < 3) {
      toast.error("Password must be at least 3 characters");
      return;
    }
    setSaving(true);
    try {
      const nowLocked = await setGamesPassword(password);
      clearGamesUnlock();
      setPassword("");
      setLocked(nowLocked);
      toast.success(nowLocked ? "Game password saved — students must enter it to play" : "Password removed — games are open");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save password");
    } finally {
      setSaving(false);
    }
  }

  async function removePassword() {
    if (saving) return;
    setSaving(true);
    try {
      await setGamesPassword(null);
      clearGamesUnlock();
      setPassword("");
      setLocked(false);
      toast.success("Password removed — anyone can play");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gamepad2 className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-bold text-lg">Games access</h1>
          <p className="text-xs text-muted-foreground">
            Optional password for Edgotchi and other student games
          </p>
        </div>
      </div>

      <div
        className={`rounded-2xl border p-4 shadow-card ${
          locked ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          {loading ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : locked ? (
            <>
              <Lock className="h-4 w-4 text-amber-700" />
              <span className="text-amber-900">Password required to play</span>
            </>
          ) : (
            <>
              <LockOpen className="h-4 w-4 text-emerald-700" />
              <span className="text-emerald-900">Open — no password</span>
            </>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          When a password is set, students must enter it in the Games modal before Edgotchi unlocks.
          Clear the password anytime to make games free again.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-card space-y-3">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
          <Shield className="h-3.5 w-3.5" /> Set or change password
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={locked ? "Enter a new password" : "Create a game password"}
          maxLength={64}
          className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
          autoComplete="new-password"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={saving || password.trim().length === 0}
            onClick={() => void savePassword()}
            className="flex-1 rounded-2xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow disabled:opacity-40"
          >
            {saving ? "Saving…" : locked ? "Update password" : "Enable password"}
          </button>
          {locked && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void removePassword()}
              className="flex-1 rounded-2xl border border-border bg-muted py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              Remove password
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
