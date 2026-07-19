import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PushBootstrap } from "@/components/PushOptIn";
import { UnreadBadgesProvider } from "@/hooks/useUnreadBadges";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <UnreadBadgesProvider>
      <PushBootstrap />
      <div className="min-h-screen flex flex-col safe-top">
        <main className="flex-1 pb-24 animate-fade-up">
          <Outlet />
        </main>
        <BottomNav />
        <PwaInstallPrompt />
      </div>
    </UnreadBadgesProvider>
  );
}
