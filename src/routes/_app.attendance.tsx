import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendanceRedirect,
});

/** Attendance is admin-only — students are redirected away. */
function AttendanceRedirect() {
  const { loading, actingAsAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (actingAsAdmin) navigate({ to: "/admin/attendance" });
    else navigate({ to: "/" });
  }, [loading, actingAsAdmin, navigate]);

  return (
    <div className="min-h-[50vh] grid place-items-center text-center px-6">
      <div>
        <Shield className="h-8 w-8 mx-auto text-primary mb-2" />
        <div className="text-sm font-semibold">Attendance is for educators</div>
        <div className="text-xs text-muted-foreground mt-1">Only admins can manage attendance.</div>
      </div>
    </div>
  );
}
