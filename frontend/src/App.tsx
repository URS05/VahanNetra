import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Panel } from "./components/ui/Panel";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { AuditPage } from "./features/audit/AuditPage";
import { StillsDemoPage } from "./features/demo/StillsDemoPage";
import { LivePage } from "./features/live/LivePage";
import { LoginPage } from "./features/login/LoginPage";
import { canAudit } from "./lib/roles";
import { useAuth } from "./store/auth";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/demo" element={<StillsDemoPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/live" element={<LivePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/audit" element={<AuditGuard />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/live" replace />} />
    </Routes>
  );
}

function RequireAuth() {
  const token = useAuth((state) => state.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AuditGuard() {
  const role = useAuth((state) => state.role);
  if (!canAudit(role)) return <Forbidden />;
  return <AuditPage />;
}

function Forbidden() {
  const navigate = useNavigate();
  useEffect(() => {
    const timer = window.setTimeout(() => navigate("/live", { replace: true }), 1600);
    return () => window.clearTimeout(timer);
  }, [navigate]);
  return (
    <div className="grid h-full place-items-center p-6">
      <Panel title="Audit log">
        <p>Not permitted for your role</p>
      </Panel>
    </div>
  );
}
