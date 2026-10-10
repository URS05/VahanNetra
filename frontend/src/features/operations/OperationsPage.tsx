import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { runSimulate } from "../../api/simulate";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import { FALLBACK_CAMERAS } from "../../config/cameras";
import { useUi } from "../../store/ui";

interface Operation {
  id: string;
  name: string;
  code: string;
  status: "ACTIVE" | "PLANNING" | "COMPLETED" | "COMPROMISED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  location: string;
  assigned: number;
  estCompletion: string;
  progress: number;
  preset?: string;
  plate?: string;
}

const OPERATIONS_SEED: Operation[] = [
  {
    id: "op-1",
    name: "SHADOW PROTOCOL",
    code: "OP-OMEGA-001",
    status: "ACTIVE",
    priority: "CRITICAL",
    description: "Multi-camera vehicle trace along Hitech City corridor with real-time OSRM drive-time projection.",
    location: "Hitech City - Financial Dist",
    assigned: 5,
    estCompletion: "2026-10-10",
    progress: 75,
    preset: "normal",
    plate: "TS09EG6531",
  },
  {
    id: "op-2",
    name: "GHOST FIRE",
    code: "OP-DELTA-002",
    status: "PLANNING",
    priority: "HIGH",
    description: "Cloned plate identification & temporal-spatial impossible travel detector.",
    location: "Cyber Towers Junction",
    assigned: 3,
    estCompletion: "2026-10-10",
    progress: 25,
    preset: "speeding",
    plate: "AP28AS1318",
  },
  {
    id: "op-3",
    name: "NIGHT STALKER",
    code: "OP-SIERRA-003",
    status: "COMPLETED",
    priority: "MEDIUM",
    description: "Automated speed telemetry and arterial congestion bottleneck surveillance.",
    location: "Mindspace Flyover",
    assigned: 2,
    estCompletion: "2026-10-09",
    progress: 100,
    preset: "slow",
    plate: "HR38V6965",
  },
  {
    id: "op-4",
    name: "CRIMSON TIDE",
    code: "OP-ALPHA-004",
    status: "ACTIVE",
    priority: "HIGH",
    description: "Watchlist intercept protocol: trigger sub-second siren alert upon plate hit.",
    location: "Financial District Hub",
    assigned: 4,
    estCompletion: "2026-10-10",
    progress: 60,
    preset: "normal",
    plate: "AP21AX369",
  },
  {
    id: "op-5",
    name: "SILENT BLADE",
    code: "OP-BRAVO-005",
    status: "COMPROMISED",
    priority: "CRITICAL",
    description: "Unregistered vehicle corridor penetration with blurred/tampered plate OCR voting.",
    location: "Bio Diversity Park",
    assigned: 2,
    estCompletion: "2026-10-10",
    progress: 40,
    preset: "loop",
    plate: "TS07AB1234",
  },
  {
    id: "op-6",
    name: "EAGLE EYE",
    code: "OP-TANGO-006",
    status: "COMPLETED",
    priority: "LOW",
    description: "Baseline corridor velocity assessment and origin-destination traffic flow calibration.",
    location: "Gachibowli Ring Road",
    assigned: 5,
    estCompletion: "2026-10-08",
    progress: 100,
    preset: "normal",
    plate: "AP10AR0658",
  },
];

export function OperationsPage() {
  const pushToast = useUi((state) => state.pushToast);
  const [operations, setOperations] = useState<Operation[]>(OPERATIONS_SEED);
  const [runningId, setRunningId] = useState<string | null>(null);

  const camerasQuery = useQuery({ queryKey: ["cameras"], queryFn: listCameras, retry: false });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: () => listEvents(), retry: false });

  const cameras = camerasQuery.data ?? FALLBACK_CAMERAS;
  const cameraOrder = cameras.map((c) => c.camera_id);

  async function launchOp(op: Operation) {
    if (!op.plate) return;
    setRunningId(op.id);
    try {
      const res = await runSimulate({
        plate: op.plate,
        camera_order: cameraOrder,
        start_time: new Date().toISOString(),
        speed_factor: 1,
        jitter_pct: 5,
        preset: op.preset || "normal",
      });
      pushToast(`Operation ${op.code} executed: ${res.count} sightings generated for ${res.plate}`, "ok");
      eventsQuery.refetch();
      // Increase progress
      setOperations((prev) =>
        prev.map((o) => (o.id === op.id ? { ...o, progress: Math.min(100, o.progress + 20) } : o))
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Execution failed", "error");
    } finally {
      setRunningId(null);
    }
  }

  const activeCount = operations.filter((o) => o.status === "ACTIVE").length;
  const completedCount = operations.filter((o) => o.status === "COMPLETED").length;
  const compromisedCount = operations.filter((o) => o.status === "COMPROMISED").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header matching Screenshot 5 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold uppercase tracking-[0.12em] text-tac-text">
            Operations Center
          </h1>
          <p className="text-[11px] text-tac-text-dim uppercase tracking-wider mt-0.5">
            Mission planning and execution oversight
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="tac-btn font-bold py-2.5 px-5">
            New Operation
          </button>
          <button className="tac-btn font-bold py-2.5 px-5 bg-orange-600 hover:bg-orange-500">
            Mission Brief
          </button>
        </div>
      </div>

      {/* KPI Cards matching Screenshot 5 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">Active Ops</div>
            <div className="tac-stat-value">{activeCount}</div>
          </div>
          <div className="text-tac-accent text-2xl font-bold">&#x25CE;</div>
        </div>
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">Completed</div>
            <div className="tac-stat-value">{completedCount}</div>
          </div>
          <div className="text-tac-green text-2xl font-bold">&#x2713;</div>
        </div>
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">Compromised</div>
            <div className="tac-stat-value text-tac-red">{compromisedCount}</div>
          </div>
          <div className="text-tac-red text-2xl font-bold">&#x2715;</div>
        </div>
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">Success Rate</div>
            <div className="tac-stat-value">94%</div>
          </div>
          <div className="text-tac-yellow text-2xl font-bold">&#x26A0;</div>
        </div>
      </div>

      {/* Grid of Operation Cards matching Screenshot 5 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {operations.map((op) => {
          const statusCls =
            op.status === "ACTIVE"
              ? "bg-tac-surface border border-tac-border text-tac-text"
              : op.status === "COMPLETED"
              ? "bg-tac-surface/60 border border-tac-border/60 text-tac-text-dim"
              : op.status === "COMPROMISED"
              ? "bg-tac-red/10 border border-tac-red/40 text-tac-red"
              : "bg-tac-surface border border-tac-border text-tac-accent";

          const priorityCls =
            op.priority === "CRITICAL"
              ? "bg-red-950/60 border border-red-700/60 text-red-400"
              : op.priority === "HIGH"
              ? "bg-amber-950/60 border border-amber-700/60 text-amber-400"
              : "bg-zinc-800 border border-zinc-700 text-zinc-300";

          return (
            <div
              key={op.id}
              className="tac-card rounded-md p-5 flex flex-col justify-between hover:border-tac-accent/50 transition-colors"
            >
              <div>
                {/* Card header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-[14px] uppercase tracking-wider text-tac-text">
                      {op.name}
                    </h3>
                    <p className="text-[10px] text-tac-text-dim font-mono tracking-wider mt-0.5">
                      {op.code}
                    </p>
                  </div>
                  <div className="text-tac-text-muted text-xs">
                    {op.status === "COMPLETED" ? (
                      <span className="text-tac-green">&#x2713;</span>
                    ) : (
                      <span>&#x25CE;</span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex gap-2 mt-3">
                  <span className={`text-[9px] uppercase px-2.5 py-0.5 font-bold tracking-wider rounded ${statusCls}`}>
                    {op.status}
                  </span>
                  <span className={`text-[9px] uppercase px-2.5 py-0.5 font-bold tracking-wider rounded ${priorityCls}`}>
                    {op.priority}
                  </span>
                </div>

                {/* Description */}
                <p className="text-[11px] text-tac-text-dim mt-4 line-clamp-2 leading-relaxed">
                  {op.description}
                </p>

                {/* Details */}
                <div className="mt-4 space-y-1.5 text-[10px] text-tac-text-muted">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]">&#x1F4CD;</span>
                    <span>{op.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]">&#x1F464;</span>
                    <span>{op.assigned} cameras assigned</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]">&#x25F7;</span>
                    <span>Est. completion: {op.estCompletion}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar & Actions */}
              <div className="mt-5 pt-3 border-t border-tac-border/60">
                <div className="flex justify-between items-center text-[10px] mb-1.5">
                  <span className="text-tac-text-muted uppercase tracking-wider">Progress</span>
                  <span className="text-tac-text font-bold font-mono">{op.progress}%</span>
                </div>
                <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="bg-tac-accent h-full transition-all duration-500"
                    style={{ width: `${op.progress}%` }}
                  />
                </div>

                {op.plate && (
                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-tac-text-muted">Target: {op.plate}</span>
                    <button
                      onClick={() => launchOp(op)}
                      disabled={runningId === op.id}
                      className="tac-btn py-1 px-3 text-[10px] font-bold"
                    >
                      {runningId === op.id ? "Simulating..." : "Execute"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
