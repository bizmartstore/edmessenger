import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { UnreadBadgesProvider } from "@/hooks/useUnreadBadges";
import { PresenceProvider } from "@/hooks/usePresence";
import { GamesProvider } from "@/hooks/useGames";

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
      <PresenceProvider>
        <GamesProvider>
          {/* Mobile: stacked column + bottom nav. Desktop (md+): sidebar + full-width main. */}
          <div className="min-h-screen flex flex-col md:flex-row safe-top">
            <DesktopSidebar />
            <div className="min-h-screen flex-1 flex flex-col min-w-0">
              <main className="flex-1 pb-24 md:pb-6 animate-fade-up md:px-8 md:pt-2">
                <Outlet />
              </main>
              <BottomNav />
              <PwaInstallPrompt />
            </div>
          </div>
        </GamesProvider>
      </PresenceProvider>
    </UnreadBadgesProvider>
  );
}
