import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CONFIG } from "../config";
import { canAudit } from "../lib/roles";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";

const NAV_ITEMS = [
  { to: "/live", label: "COMMAND CENTER", icon: "monitor" },
  { to: "/cameras", label: "AGENT NETWORK", icon: "agents" },
  { to: "/operations", label: "OPERATIONS", icon: "operations" },
  { to: "/analytics", label: "INTELLIGENCE", icon: "intelligence" },
  { to: "/audit", label: "SYSTEMS", audit: true, icon: "systems" },
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
    case "agents":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "operations":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "intelligence":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "systems":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
  const pageLabel = currentNav ? currentNav.label : "OVERVIEW";

  return (
    <div className="flex h-dvh bg-tac-bg text-tac-text overflow-hidden font-mono select-none">
      {/* Sidebar matching all screenshots */}
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
            <button className="text-tac-text-muted hover:text-tac-text text-sm mt-0.5">
              &lt;
            </button>
          </div>

          {/* Navigation links matching Screenshot 1-5 */}
          <nav className="flex flex-col gap-1 px-3 mt-4" aria-label="Primary">
            {NAV_ITEMS.filter((item) => !item.audit || canAudit(role)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-3 text-[11px] font-bold tracking-wider rounded transition-all duration-150 ${
                    isActive
                      ? "bg-tac-accent text-black shadow-lg shadow-tac-accent/20"
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

        {/* Sidebar Footer: SYSTEM ONLINE Card matching screenshots */}
        <div className="p-3">
          <div className="p-3.5 bg-tac-surface border border-tac-border rounded text-[10px] space-y-1.5">
            <div className="flex items-center gap-2 font-bold tracking-wider text-tac-text">
              <span className={`w-2 h-2 rounded-full ${apiDown ? "bg-tac-red animate-pulse" : "bg-tac-text"}`} />
              <span>SYSTEM {apiDown ? "OFFLINE" : "ONLINE"}</span>
            </div>
            <div className="text-tac-text-dim font-mono text-[9px] space-y-0.5 pt-1">
              <div>UPTIME: 72:14:33</div>
              <div>AGENTS: 5 ACTIVE</div>
              <div>MISSIONS: 23 ONGOING</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Header Bar matching all screenshots */}
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
