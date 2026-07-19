import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — EdMessenger" },
      { name: "description", content: "Sign in with Google to join your classroom." },
    ],
  }),
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function signInWithGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });
    if (error) { toast.error(error.message); setBusy(false); }
  }

  return (
    <div className="min-h-screen flex flex-col safe-top">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto w-full">
        <img
          src="/logo.png"
          alt="EdMessenger"
          className="w-28 h-28 rounded-full shadow-glow mb-6 animate-pop object-cover bg-white"
        />
        <h1 className="text-4xl font-extrabold tracking-tight text-center animate-fade-up">
          Welcome to{" "}
          <span
            className="text-primary"
            style={{
              backgroundImage: "var(--gradient-primary)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            EdMessenger
          </span>
        </h1>
        <p className="mt-3 text-center text-muted-foreground text-sm leading-relaxed animate-fade-up">
          Learn. Communicate. Succeed.<br/>Your mobile classroom for chat, lessons, and quizzes.
        </p>

        <div className="grid grid-cols-3 gap-3 w-full mt-8 animate-fade-up">
          {[
            { icon: MessageCircle, label: "Chat" },
            { icon: BookOpen, label: "Lessons" },
            { icon: Sparkles, label: "Quizzes" },
          ].map((f) => (
            <div key={f.label} className="glass-card rounded-2xl p-3 text-center">
              <f.icon className="h-5 w-5 mx-auto text-primary" />
              <div className="mt-1 text-[11px] font-medium text-muted-foreground">{f.label}</div>
            </div>
          ))}
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={busy}
          className="mt-8 w-full py-3.5 rounded-2xl bg-card border border-border shadow-card font-semibold flex items-center justify-center gap-3 hover:shadow-glow transition-all disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {busy ? "Redirecting…" : "Continue with Google"}
        </button>

        <p className="mt-6 text-[11px] text-muted-foreground text-center">
          By continuing you agree to be a kind, curious student.
        </p>
      </div>
      <PwaInstallPrompt />
    </div>
  );
}
