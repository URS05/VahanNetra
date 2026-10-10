import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CONFIG } from "../config";
import { canAudit } from "../lib/roles";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";

const NAV_ITEMS = [
  { to: "/live", label: "COMMAND CENTER", icon: "monitor" },
  { to: "/cameras", label: "CAMERA FEEDS", icon: "camera" },
  { to: "/analytics", label: "TRAFFIC INTEL", icon: "intel" },
  { to: "/audit", label: "AUDIT LOG", audit: true, icon: "audit" },
];

function renderNavIcon(name: string) {
  switch (name) {
    case "monitor":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "camera":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "intel":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "audit":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    default:
      return null;
  }
}

export function AppShell() {
  const role = useAuth((state) => state.role);
  const clear = useAuth((state) => state.clear);
  const apiDown = useUi((state) => state.apiDown);
  const expired = useUi((state) => state.sessionExpired);
  const clearExpired = useUi((state) => state.clearSessionExpired);
  const pushToast = useUi((state) => state.pushToast);
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!expired) return;
    pushToast("Session expired", "error");
    clearExpired();
    clear();
    navigate("/login", { replace: true });
  }, [expired, pushToast, clearExpired, clear, navigate]);

  // Format UTC: DD/MM/YYYY HH:mm:ss UTC
  const pad = (n: number) => String(n).padStart(2, "0");
  const utcStr = `${pad(now.getUTCDate())}/${pad(now.getUTCMonth() + 1)}/${now.getUTCFullYear()} ${pad(
    now.getUTCHours()
  )}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;

  const host = CONFIG.apiBase.replace(/^https?:\/\//, "");

  // Determine breadcrumb page name
  const currentNav = NAV_ITEMS.find((item) => item.to === location.pathname);
  const pageLabel = currentNav ? currentNav.label : "COMMAND CENTER";

  return (
    <div className="flex h-dvh bg-tac-bg text-tac-text overflow-hidden font-mono select-none">
      {/* Sidebar matching Tactical Ops reference */}
      <aside className="flex w-[210px] shrink-0 flex-col border-r border-tac-border bg-tac-bg justify-between">
        <div>
          {/* Brand header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-tac-border/40">
            <div>
              <div className="text-tac-accent text-[15px] font-bold tracking-[0.14em] leading-tight">
                TACTICAL OPS
              </div>
              <div className="text-[10px] text-tac-text-muted uppercase tracking-widest mt-1">
                v2.1.7 CLASSIFIED
              </div>
            </div>
            <span className="text-tac-text-muted text-sm mt-0.5">&lt;</span>
          </div>

          {/* Navigation links */}
          <nav className="flex flex-col gap-1 px-3 mt-4" aria-label="Primary">
            {NAV_ITEMS.filter((item) => !item.audit || canAudit(role)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-3 text-[11px] font-bold tracking-wider rounded transition-all duration-150 ${
                    isActive
                      ? "bg-tac-accent text-white shadow-lg shadow-tac-accent/20"
                      : "text-tac-text-dim hover:text-tac-text hover:bg-tac-surface"
                  }`
                }
              >
                <span className="shrink-0">{renderNavIcon(item.icon)}</span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer: SYSTEM ONLINE Card */}
        <div className="p-3">
          <div className="p-3.5 bg-tac-surface border border-tac-border rounded-lg text-[10px] space-y-1.5">
            <div className="flex items-center gap-2 font-bold tracking-wider text-tac-text">
              <span className={`w-2 h-2 rounded-full ${apiDown ? "bg-tac-red animate-pulse" : "bg-tac-green"}`} />
              <span>SYSTEM {apiDown ? "OFFLINE" : "ONLINE"}</span>
            </div>
            <div className="text-tac-text-dim font-mono text-[9px] space-y-0.5 pt-1">
              <div>UPTIME: 72:14:33</div>
              <div>CAMERAS: 5 ACTIVE</div>
              <div>CORRIDOR: HYDERABAD</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex h-12 items-center justify-between border-b border-tac-border px-6 bg-tac-bg shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wider">
            <span className="text-tac-text-muted">TACTICAL COMMAND</span>
            <span className="text-tac-text-muted">/</span>
            <span className="text-tac-accent">{pageLabel}</span>
          </div>

          {/* Right info */}
          <div className="flex items-center gap-5">
            <span className="text-[10px] text-tac-text-muted font-mono tracking-wider">
              LAST UPDATE: {utcStr}
            </span>

            <button
              title="Notifications"
              className="text-tac-text-dim hover:text-tac-accent transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            <button
              title="Refresh Telemetry"
              onClick={() => window.location.reload()}
              className="text-tac-text-dim hover:text-tac-accent transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>

            <button
              onClick={() => {
                clear();
                navigate("/login", { replace: true });
              }}
              className="text-[10px] font-bold text-tac-text-dim hover:text-tac-accent uppercase tracking-wider transition-colors ml-2"
            >
              LOGOUT [{role?.toUpperCase() || "VIEWER"}]
            </button>
          </div>
        </header>

        {/* API Down Warning */}
        {apiDown ? (
          <div className="bg-tac-critical/20 border-b border-tac-critical/40 px-6 py-1.5 text-[10px] text-tac-red uppercase tracking-wider font-mono">
            &#x26A0; Telemetry disconnected: cannot reach API at {host}
          </div>
        ) : null}

        {/* Main Routed Page */}
        <main className="min-h-0 flex-1 overflow-auto bg-tac-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
