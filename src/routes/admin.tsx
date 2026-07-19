import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Shield, LayoutDashboard, ClipboardList, BookOpen, CalendarCheck, Users, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/quizzes", label: "Quizzes", icon: ClipboardList },
  { to: "/admin/lessons", label: "Lessons", icon: BookOpen },
  { to: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/admin/students", label: "Students", icon: Users },
];

function AdminLayout() {
  const { loading, session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth" });
    else if (!isAdmin) navigate({ to: "/" });
  }, [loading, session, isAdmin, navigate]);

  if (loading || !session || !isAdmin) {
    return <div className="min-h-screen grid place-items-center"><div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen safe-top">
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-lg border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <Link to="/" className="p-2 -ml-2 rounded-xl hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="h-9 w-9 rounded-xl gradient-primary grid place-items-center"><Shield className="h-4 w-4 text-primary-foreground" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm">Admin</div>
            <div className="text-[10px] text-muted-foreground">Educator dashboard</div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-2 pb-2 overflow-x-auto">
          <div className="flex gap-1">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all",
                    active ? "gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <n.icon className="h-3.5 w-3.5" /> {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5 animate-fade-up pb-16">
        <Outlet />
      </main>
    </div>
  );
}
