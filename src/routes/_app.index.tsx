import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, BookOpen, ClipboardList, LogOut, Sparkles, Shield, UserRound } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  component: Home,
});

function Home() {
  const { profile, signOut, actingAsAdmin, canToggleAdmin, viewMode, setViewMode, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ lessons: 0, quizzes: 0 });

  useEffect(() => {
    (async () => {
      const [l, q] = await Promise.all([
        supabase.from("lessons").select("id", { count: "exact", head: true }),
        supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("published", true),
      ]);
      setStats({ lessons: l.count ?? 0, quizzes: q.count ?? 0 });
    })();
  }, []);

  const first = (profile?.full_name ?? "").split(" ")[0] || "friend";

  const tiles = [
    { to: "/chat", icon: MessageCircle, label: "Classroom Chat", desc: "Say hi to your class", color: "from-violet-500 to-fuchsia-500" },
    { to: "/lessons", icon: BookOpen, label: "Lessons", desc: `${stats.lessons} available`, color: "from-amber-400 to-orange-500" },
    { to: "/quizzes", icon: ClipboardList, label: "Quizzes", desc: `${stats.quizzes} to take`, color: "from-emerald-400 to-teal-500" },
  ];

  return (
    <div className="px-5 pt-6 max-w-md mx-auto">
      <header className="flex items-center gap-3">
        <img src="/logo.png" alt="EdMessenger" className="h-12 w-12 rounded-2xl object-cover shadow-card" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Welcome back</div>
          <div className="font-bold truncate">{first}</div>
        </div>
        {canToggleAdmin && (
          <button
            type="button"
            onClick={() => {
              const next = viewMode === "admin" ? "user" : "admin";
              setViewMode(next);
              if (next === "admin") navigate({ to: "/admin" });
            }}
            className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors"
            title={viewMode === "admin" ? "Switch to student view" : "Switch to admin"}
          >
            {viewMode === "admin" ? (
              <UserRound className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Shield className="h-4 w-4 text-primary" />
            )}
          </button>
        )}
        {isAdmin && !canToggleAdmin && actingAsAdmin && (
          <Link to="/admin" className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors" title="Admin">
            <Shield className="h-4 w-4 text-primary" />
          </Link>
        )}
        <button onClick={signOut} className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors" title="Sign out">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </button>
      </header>

      {canToggleAdmin && (
        <div className="mt-3 flex rounded-2xl bg-muted p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode("user")}
            className={`flex-1 py-2 rounded-xl transition-all ${viewMode === "user" ? "bg-card shadow-card text-foreground" : "text-muted-foreground"}`}
          >
            Student
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("admin");
              navigate({ to: "/admin" });
            }}
            className={`flex-1 py-2 rounded-xl transition-all ${viewMode === "admin" ? "gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground"}`}
          >
            Admin
          </button>
        </div>
      )}

      <div className="mt-6 rounded-3xl gradient-hero p-5 text-white shadow-glow overflow-hidden relative">
        <Sparkles className="absolute -top-2 -right-2 h-24 w-24 text-white/10" />
        <div className="text-xs uppercase tracking-widest opacity-80">Today</div>
        <div className="mt-1 text-2xl font-extrabold leading-tight">Ready to learn something new?</div>
        <div className="mt-1 text-sm opacity-90">Jump into a lesson or catch up on class chat.</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group rounded-2xl p-4 bg-card shadow-card hover:shadow-glow hover:-translate-y-0.5 transition-all border border-border"
          >
            <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${t.color} grid place-items-center mb-3 group-hover:scale-110 transition-transform`}>
              <t.icon className="h-5 w-5 text-white" />
            </div>
            <div className="font-semibold text-sm">{t.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
