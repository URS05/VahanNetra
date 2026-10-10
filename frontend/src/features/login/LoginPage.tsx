import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { health, login } from "../../api/auth";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import { ApiError } from "../../api/client";
import { CONFIG, type Role } from "../../config";
import { isSameIstDay } from "../../lib/format";
import { useAuth } from "../../store/auth";
import "./login.css";

const ROLES: { role: Role; line: string }[] = [
  { role: "viewer", line: "Live map, alerts and analytics." },
  { role: "analyst", line: "Search, trajectory, simulate and audit." },
  { role: "admin", line: "Same tools as analyst for this demo." },
];

export function LoginPage() {
  const token = useAuth((state) => state.token);
  const setSession = useAuth((state) => state.setSession);
  const navigate = useNavigate();
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [logoOn, setLogoOn] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cameras = useQuery({ queryKey: ["cameras", "public"], queryFn: listCameras, retry: false });
  const events = useQuery({ queryKey: ["events", "public"], queryFn: () => listEvents(), retry: false });
  const status = useQuery({ queryKey: ["health"], queryFn: health, retry: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf = 0;
    const draw = () => {
      const width = (canvas.width = canvas.offsetWidth);
      const height = (canvas.height = canvas.offsetHeight);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "12px ui-monospace, monospace";
      const cols = Math.ceil(width / 16);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < 10; j += 1) {
          const y = ((i * 19 + j * 18 + frame) % (height + 30)) - 10;
          const ch = String.fromCharCode(48 + ((i + j) % 10));
          ctx.fillText(ch, i * 16, y);
        }
      }
    };
    draw();
    if (reduced) return;
    const loop = () => {
      frame += 1.4;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (token) return <Navigate to="/live" replace />;

  const stats = buildStats(cameras.data?.length, events.data, status.data?.cached_routes);

  async function choose(role: Role) {
    setPending(role);
    setError(null);
    try {
      const session = await login(role);
      setSession(session.token, session.role);
      navigate("/live", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Login failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="login-page">
      <div className="bg">
        {videoOn ? (
          <video
            className="bg-video"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoOn(false)}
          >
            <source src={CONFIG.loginVideo} type="video/mp4" />
          </video>
        ) : null}
        <div className="grain" />
        <canvas ref={canvasRef} className="ascii" aria-hidden />
      </div>
      <div className="page">
        <header className="login-header">
          <div className="logo-btn" aria-hidden>
            {logoOn ? (
              <img src="/logo.webp" alt="" width={52} height={52} onError={() => setLogoOn(false)} />
            ) : (
              <span className="logo-fallback">PT</span>
            )}
          </div>
          <div className="nav-pill">Plate Trace</div>
        </header>
        <main className="hero">
          <h1 className="headline">
            <span>Plate Trace</span>
            <span>Vehicle Movement Intelligence</span>
          </h1>
          <p className="subhead">
            Track vehicles across 5 Hyderabad cameras with live alerts and audit trails.
          </p>
          <div className="cta-row">
            {ROLES.map((item) => (
              <div className="role-block" key={item.role}>
                <button
                  className="cta"
                  type="button"
                  disabled={pending !== null}
                  onClick={() => choose(item.role)}
                >
                  {pending === item.role ? "Signing in" : labelFor(item.role)}
                </button>
                <p className="role-line">{item.line}</p>
              </div>
            ))}
          </div>
          {error ? <p className="login-error">{error}</p> : null}
          <p className="login-note">Demo access. Roles are not password protected.</p>
        </main>
        {stats.length ? (
          <footer className="stats" aria-label="Live counts">
            {stats.map((stat, index) => (
              <Stat key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} delay={500 + index * 80} />
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function labelFor(role: Role): string {
  if (role === "viewer") return "Viewer";
  if (role === "analyst") return "Analyst";
  return "Admin";
}

function buildStats(
  cameraCount: number | undefined,
  events: { timestamp: string }[] | undefined,
  routes: number | undefined,
): { icon: string; label: string; value: number }[] {
  const stats: { icon: string; label: string; value: number }[] = [];
  if (typeof cameraCount === "number") stats.push({ icon: "C", label: "Cameras", value: cameraCount });
  if (events) {
    stats.push({
      icon: "S",
      label: "Sightings today",
      value: events.filter((event) => isSameIstDay(event.timestamp)).length,
    });
  }
  if (typeof routes === "number") stats.push({ icon: "R", label: "Cached routes", value: routes });
  return stats;
}

function Stat({ icon, label, value, delay }: { icon: string; label: string; value: number; delay: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(value);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const duration = 1500;
        const begin = performance.now() + delay;
        const tick = (now: number) => {
          if (now < begin) {
            raf = requestAnimationFrame(tick);
            return;
          }
          const t = Math.min(1, (now - begin) / duration);
          const eased = 1 - (1 - t) ** 3;
          setShown(value * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, delay]);
  const text = Number.isInteger(value) ? String(Math.round(shown)) : shown.toFixed(1);
  return (
    <div className="stat" ref={ref} style={{ animationDelay: `${delay / 1000}s` }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{text}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
