import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CONFIG } from "../config";
import { canAudit } from "../lib/roles";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

const links = [
  { to: "/live", label: "Live map" },
  { to: "/demo", label: "Stills demo" },
  { to: "/analytics", label: "Analytics" },
  { to: "/audit", label: "Audit log", audit: true },
];

export function AppShell() {
  const role = useAuth((state) => state.role);
  const clear = useAuth((state) => state.clear);
  const apiDown = useUi((state) => state.apiDown);
  const expired = useUi((state) => state.sessionExpired);
  const clearExpired = useUi((state) => state.clearSessionExpired);
  const pushToast = useUi((state) => state.pushToast);
  const navigate = useNavigate();

  useEffect(() => {
    if (!expired) return;
    pushToast("Session expired", "error");
    clearExpired();
    clear();
    navigate("/login", { replace: true });
  }, [expired, pushToast, clearExpired, clear, navigate]);

  const host = CONFIG.apiBase.replace(/^https?:\/\//, "");

  return (
    <div className="flex h-dvh bg-room-bg text-white">
      <aside className="flex w-16 shrink-0 flex-col border-r border-white/10 bg-black/40 md:w-52">
        <div className="flex h-14 items-center gap-2 px-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white font-display text-[10px] text-black">
            PT
          </span>
          <span className="hidden text-sm font-semibold md:block">Plate Trace</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Primary">
          {links
            .filter((link) => !link.audit || canAudit(role))
            .map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-xl px-2 py-2 text-sm ${isActive ? "bg-white text-black" : "text-white/70 hover:bg-white/5"}`
                }
                title={link.label}
              >
                <span className="md:hidden">{link.label.slice(0, 1)}</span>
                <span className="hidden md:inline">{link.label}</span>
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-white/10 px-3 md:px-4">
          <div className="flex items-center gap-2">
            <Badge tone="role">{role}</Badge>
            <Badge tone="live">Simulated feed</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-xs text-white/70">
              <span
                className={`h-2.5 w-2.5 rounded-full ${apiDown ? "bg-red-400" : "bg-emerald-400"}`}
                aria-hidden
              />
              <span className="sr-only">{apiDown ? "API unreachable" : "API connected"}</span>
              {apiDown ? "Offline" : "Connected"}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                clear();
                navigate("/login", { replace: true });
              }}
            >
              Log out
            </Button>
          </div>
        </header>
        {apiDown ? (
          <div className="bg-red-950 px-4 py-2 text-sm text-red-50" role="status">
            Cannot reach API at {host}
          </div>
        ) : null}
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
