import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Castle,
  Check,
  Gamepad2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { clearGamesUnlock, gamesPasswordRequired, setGamesPassword } from "@/lib/games-access";
import { AdminSubjectSelect } from "@/components/AdminSubjectSelect";
import { useAuth } from "@/hooks/useAuth";
import {
  approveAllQuestions,
  createTowerEvent,
  deleteTowerEvent,
  deleteTowerQuestion,
  fetchEventStats,
  generateTowerQuestions,
  listAdminTowerEvents,
  listEventPlayers,
  listTowerQuestions,
  saveTowerQuestions,
  updateTowerEvent,
  updateTowerQuestion,
  type TowerDifficulty,
  type TowerEvent,
  type TowerPlayer,
  type TowerQuestion,
} from "@/lib/gotchi-tower";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/games")({
  component: AdminGames,
});

type Tab = "access" | "tower";

function AdminGames() {
  const [tab, setTab] = useState<Tab>("tower");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gamepad2 className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-bold text-lg">Games</h1>
          <p className="text-xs text-muted-foreground">
            Gotchi Tower events, quiz generation, and student game access
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-2xl bg-muted p-1">
        <TabBtn active={tab === "tower"} onClick={() => setTab("tower")} icon={<Castle className="h-3.5 w-3.5" />}>
          Gotchi Tower
        </TabBtn>
        <TabBtn active={tab === "access"} onClick={() => setTab("access")} icon={<Lock className="h-3.5 w-3.5" />}>
          Access lock
        </TabBtn>
      </div>

      {tab === "tower" ? <TowerAdmin /> : <AccessLockAdmin />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
        active ? "bg-card shadow-card text-foreground" : "text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function AccessLockAdmin() {
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
      toast.success(nowLocked ? "Game password saved" : "Password removed");
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

function TowerAdmin() {
  const { user } = useAuth();
  const [events, setEvents] = useState<TowerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TowerEvent | null>(null);
  const [questions, setQuestions] = useState<TowerQuestion[]>([]);
  const [players, setPlayers] = useState<TowerPlayer[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<"questions" | "live">("questions");

  const [title, setTitle] = useState("Gotchi Tower Climb");
  const [subjectId, setSubjectId] = useState("");
  const [difficulty, setDifficulty] = useState<TowerDifficulty>("mixed");
  const [floors, setFloors] = useState(20);
  const [limit, setLimit] = useState(30);
  const [gcoins, setGcoins] = useState(25);
  const [pvp, setPvp] = useState(true);
  const [wagerMin, setWagerMin] = useState(0);
  const [wagerMax, setWagerMax] = useState(50);
  const [aiTopic, setAiTopic] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [aiCount, setAiCount] = useState(12);
  const [generating, setGenerating] = useState(false);
  const [draftQs, setDraftQs] = useState<TowerQuestion[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await listAdminTowerEvents());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/gotchi_tower|does not exist|schema cache|PGRST/i.test(msg)) {
        toast.error("Run SUPABASE_MIGRATION_GOTCHI_TOWER.sql in Supabase first");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openEvent(ev: TowerEvent) {
    setSelected(ev);
    setPanel("questions");
    try {
      const [qs, pls, st] = await Promise.all([
        listTowerQuestions(ev.id),
        listEventPlayers(ev.id),
        fetchEventStats(ev.id).catch(() => ({})),
      ]);
      setQuestions(qs);
      setPlayers(pls);
      setStats(st);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load event");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || creating) return;
    if (!subjectId) {
      toast.error("Select a subject");
      return;
    }
    setCreating(true);
    try {
      const ev = await createTowerEvent({
        title,
        subject_id: subjectId,
        created_by: user.id,
        difficulty,
        floor_count: floors,
        player_limit: limit,
        gcoin_reward: gcoins,
        pvp_enabled: pvp,
        pvp_wager_min: wagerMin,
        pvp_wager_max: wagerMax,
      });
      toast.success(`Draft created — code ${ev.code}`);
      setCreating(false);
      await refresh();
      await openEvent(ev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
      setCreating(false);
    }
  }

  async function runAi() {
    if (!selected || generating) return;
    setGenerating(true);
    try {
      const qs = await generateTowerQuestions({
        topic: aiTopic.trim() || selected.title,
        notes: aiNotes,
        count: aiCount,
        difficulty: selected.difficulty,
        floorCount: selected.floor_count,
      });
      setDraftQs(qs);
      toast.success(`Generated ${qs.length} questions — review before saving`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveDrafts() {
    if (!selected || !draftQs.length) return;
    try {
      await saveTowerQuestions(selected.id, draftQs);
      setDraftQs([]);
      setQuestions(await listTowerQuestions(selected.id));
      toast.success("Questions saved as drafts (approve to publish)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function publishLobby() {
    if (!selected) return;
    const approved = questions.filter((q) => q.approved).length;
    if (approved < 3) {
      toast.error("Approve at least 3 questions before opening the lobby");
      return;
    }
    try {
      await updateTowerEvent(selected.id, {
        status: "lobby",
        published_at: new Date().toISOString(),
      });
      toast.success(`Lobby open — students join with code ${selected.code}`);
      await refresh();
      setSelected({ ...selected, status: "lobby" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    }
  }

  async function startLive() {
    if (!selected) return;
    try {
      await updateTowerEvent(selected.id, {
        status: "live",
        started_at: new Date().toISOString(),
      });
      toast.success("Tower is live — climbers can ascend!");
      setSelected({ ...selected, status: "live" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    }
  }

  async function endEvent() {
    if (!selected) return;
    try {
      await updateTowerEvent(selected.id, {
        status: "ended",
        ended_at: new Date().toISOString(),
      });
      toast.success("Event ended");
      setSelected({ ...selected, status: "ended" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "End failed");
    }
  }

  return (
    <div className="space-y-4">
      {!selected ? (
        <>
          <form onSubmit={(e) => void handleCreate(e)} className="rounded-3xl border border-border bg-card p-4 shadow-card space-y-3">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
              <Plus className="h-3.5 w-3.5" /> New Gotchi Tower event
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <AdminSubjectSelect value={subjectId} onChange={setSubjectId} required />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] space-y-1">
                <span className="text-muted-foreground">Difficulty</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as TowerDifficulty)}
                  className="w-full rounded-xl border border-border bg-muted px-2 py-2 text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="text-[11px] space-y-1">
                <span className="text-muted-foreground">Floors</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={floors}
                  onChange={(e) => setFloors(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-muted px-2 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] space-y-1">
                <span className="text-muted-foreground">Player limit</span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-muted px-2 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] space-y-1">
                <span className="text-muted-foreground">GCoin reward</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={gcoins}
                  onChange={(e) => setGcoins(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-muted px-2 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={pvp} onChange={(e) => setPvp(e.target.checked)} />
                PvP enabled
              </label>
              <label className="inline-flex items-center gap-1 text-[11px]">
                Wager min
                <input
                  type="number"
                  min={0}
                  value={wagerMin}
                  onChange={(e) => setWagerMin(Number(e.target.value))}
                  className="w-16 rounded-lg border border-border bg-muted px-2 py-1"
                />
              </label>
              <label className="inline-flex items-center gap-1 text-[11px]">
                max
                <input
                  type="number"
                  min={0}
                  value={wagerMax}
                  onChange={(e) => setWagerMax(Number(e.target.value))}
                  className="w-16 rounded-lg border border-border bg-muted px-2 py-1"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-2xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow disabled:opacity-40"
            >
              {creating ? "Creating…" : "Create draft event"}
            </button>
          </form>

          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading events…</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tower events yet.</p>
            ) : (
              events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => void openEvent(ev)}
                  className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-card hover:shadow-glow"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{ev.title}</div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">{ev.status}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Code <span className="font-mono font-semibold text-foreground">{ev.code}</span>
                    {" · "}
                    {(ev.subjects as { name?: string } | null)?.name || "Subject"}
                    {" · "}
                    {ev.floor_count} floors · {ev.difficulty}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => setSelected(null)} className="rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold">
              ← Back
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{selected.title}</div>
              <div className="text-[11px] text-muted-foreground">
                Code <span className="font-mono font-bold text-foreground">{selected.code}</span> · {selected.status}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this event?")) {
                  void deleteTowerEvent(selected.id).then(() => {
                    setSelected(null);
                    void refresh();
                  });
                }
              }}
              className="rounded-xl bg-rose-500/10 p-2 text-rose-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {selected.status === "draft" && (
              <ActionBtn onClick={() => void publishLobby()}>Open lobby</ActionBtn>
            )}
            {selected.status === "lobby" && (
              <ActionBtn onClick={() => void startLive()}>Start tower</ActionBtn>
            )}
            {(selected.status === "lobby" || selected.status === "live") && (
              <ActionBtn onClick={() => void endEvent()} tone="muted">
                End event
              </ActionBtn>
            )}
            <ActionBtn
              onClick={() => void approveAllQuestions(selected.id).then(async () => {
                setQuestions(await listTowerQuestions(selected.id));
                toast.success("All questions approved");
              })}
              tone="muted"
            >
              <Check className="h-3.5 w-3.5" /> Approve all
            </ActionBtn>
          </div>

          <div className="flex gap-1 rounded-2xl bg-muted p-1">
            <TabBtn active={panel === "questions"} onClick={() => setPanel("questions")} icon={<Sparkles className="h-3.5 w-3.5" />}>
              Questions
            </TabBtn>
            <TabBtn
              active={panel === "live"}
              onClick={() => {
                setPanel("live");
                void listEventPlayers(selected.id).then(setPlayers);
                void fetchEventStats(selected.id).then(setStats).catch(() => {});
              }}
              icon={<Users className="h-3.5 w-3.5" />}
            >
              Live dashboard
            </TabBtn>
          </div>

          {panel === "questions" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Gemini AI generate</div>
                <input
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Topic (defaults to event title)"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm"
                />
                <textarea
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  placeholder="Lesson notes / competencies for Gemini…"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm"
                />
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="w-20 rounded-xl border border-border bg-muted px-2 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => void runAi()}
                    className="flex-1 rounded-xl py-2 text-sm font-semibold gradient-primary text-primary-foreground disabled:opacity-40"
                  >
                    {generating ? "Generating…" : "Generate with Gemini"}
                  </button>
                </div>
                {draftQs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold">{draftQs.length} draft questions</div>
                    {draftQs.slice(0, 4).map((q, i) => (
                      <div key={i} className="rounded-xl bg-muted px-3 py-2 text-xs">
                        <div className="font-medium">{q.question}</div>
                        <div className="text-muted-foreground mt-0.5">
                          {q.difficulty} · floors {q.floor_min}–{q.floor_max} · {q.category}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => void saveDrafts()}
                      className="w-full rounded-xl border border-border py-2 text-sm font-semibold"
                    >
                      Save drafts to event
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {questions.map((q) => (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    onChange={async (patch) => {
                      if (!q.id) return;
                      await updateTowerQuestion(q.id, patch);
                      setQuestions(await listTowerQuestions(selected.id));
                    }}
                    onDelete={async () => {
                      if (!q.id) return;
                      await deleteTowerQuestion(q.id);
                      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
                    }}
                  />
                ))}
                {questions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No questions yet — generate with Gemini or add manually after saving drafts.</p>
                )}
              </div>

              <ManualQuestionForm
                eventId={selected.id}
                floorCount={selected.floor_count}
                onSaved={async () => setQuestions(await listTowerQuestions(selected.id))}
              />
            </div>
          )}

          {panel === "live" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Players" value={stats.players ?? players.length} />
                <Stat label="Online" value={stats.online ?? 0} />
                <Stat label="Avg floor" value={stats.avg_floor ?? 0} />
                <Stat label="Accuracy %" value={stats.accuracy ?? 0} />
                <Stat label="Correct" value={stats.total_correct ?? 0} />
                <Stat label="Wrong" value={stats.total_wrong ?? 0} />
                <Stat label="GCoins" value={stats.gcoins_earned ?? 0} />
                <Stat label="Max floor" value={stats.max_floor ?? 0} />
              </div>
              <button
                type="button"
                onClick={() => {
                  void listEventPlayers(selected.id).then(setPlayers);
                  void fetchEventStats(selected.id).then(setStats);
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
              <div className="rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-left">
                    <tr>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">Floor</th>
                      <th className="px-3 py-2">Acc</th>
                      <th className="px-3 py-2">GCoins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const total = p.correct_answers + p.wrong_answers;
                      const acc = total ? Math.round((100 * p.correct_answers) / total) : 0;
                      return (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">
                            {p.display_name}
                            {p.online ? " · 🟢" : ""}
                          </td>
                          <td className="px-3 py-2">{p.floor}</td>
                          <td className="px-3 py-2">{acc}%</td>
                          <td className="px-3 py-2">{p.gcoins_earned}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  tone = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold",
        tone === "primary"
          ? "gradient-primary text-primary-foreground shadow-glow"
          : "bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  );
}

function QuestionRow({
  q,
  onChange,
  onDelete,
}: {
  q: TowerQuestion;
  onChange: (patch: Partial<TowerQuestion>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(q.question);
  const [options, setOptions] = useState(q.options.join("\n"));

  return (
    <div className={cn("rounded-2xl border p-3", q.approved ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card")}>
      {!editing ? (
        <>
          <div className="text-sm font-medium">{q.question}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Ans: {q.options[q.correct_index]} · {q.difficulty} · F{q.floor_min}–{q.floor_max}
            {q.approved ? " · Approved" : " · Draft"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => void onChange({ approved: !q.approved })}
              className="rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold"
            >
              {q.approved ? "Unapprove" : "Approve"}
            </button>
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold">
              <Pencil className="inline h-3 w-3" /> Edit
            </button>
            <button type="button" onClick={() => void onDelete()} className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-700">
              Delete
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full rounded-xl border border-border bg-muted px-2 py-2 text-sm" rows={2} />
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="One option per line"
            className="w-full rounded-xl border border-border bg-muted px-2 py-2 text-sm"
            rows={4}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                void onChange({
                  question,
                  options: options.split("\n").map((s) => s.trim()).filter(Boolean),
                }).then(() => setEditing(false))
              }
              className="rounded-xl gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualQuestionForm({
  eventId,
  floorCount,
  onSaved,
}: {
  eventId: string;
  floorCount: number;
  onSaved: () => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [hint, setHint] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      toast.error("Need a question and at least 2 options");
      return;
    }
    await saveTowerQuestions(eventId, [
      {
        question: question.trim(),
        options: opts,
        correct_index: Math.min(correct, opts.length - 1),
        explanation,
        hint,
        difficulty: "medium",
        category: "manual",
        competency: "",
        estimated_seconds: 30,
        floor_min: 1,
        floor_max: floorCount,
        approved: false,
        sort_order: 999,
      },
    ]);
    setQuestion("");
    setOptions(["", "", "", ""]);
    setExplanation("");
    setHint("");
    toast.success("Question added");
    await onSaved();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-2xl border border-dashed border-border p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Add question manually</div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question"
        className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm"
      />
      {options.map((o, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="radio"
            name="correct"
            checked={correct === i}
            onChange={() => setCorrect(i)}
          />
          <input
            value={o}
            onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={`Option ${String.fromCharCode(65 + i)}`}
            className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm"
          />
        </div>
      ))}
      <input
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Hint (optional)"
        className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm"
      />
      <input
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Explanation"
        className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm"
      />
      <button type="submit" className="w-full rounded-xl bg-muted py-2 text-sm font-semibold">
        Add question
      </button>
    </form>
  );
}
