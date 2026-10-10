import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from "recharts";
import { listAlerts } from "../../api/alerts";
import { ApiError, wsUrl } from "../../api/client";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import { getHeatmap } from "../../api/analytics";
import { runSimulate } from "../../api/simulate";
import { getTrajectory } from "../../api/trajectory";
import type { AlertItem, Event, Trajectory } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { FALLBACK_CAMERAS, cameraById } from "../../config/cameras";
import { CONFIG, type PresetId } from "../../config";
import { formatIst } from "../../lib/format";
import { flattenPath, midpoint, sampleArrows, type LonLat } from "../../lib/geo";
import { canSearch } from "../../lib/roles";
import { MapView, type MapHandle } from "../../map/MapView";
import { resolveRoads, type ResolvedSegment } from "../../map/roads";
import { useAlongPath } from "../../map/useAlongPath";
import { useAuth } from "../../store/auth";
import { useUi } from "../../store/ui";
import { AlertsStack } from "./AlertsStack";
import { OcrPanel } from "./OcrPanel";
import { SearchPanel } from "./SearchPanel";
import { SimulatePanel } from "./SimulatePanel";
import { TrajectoryPanel } from "./TrajectoryPanel";
import { WatchlistPanel } from "./WatchlistPanel";

const NO_CAMERAS: never[] = [];

type Run = {
  id: number;
  events: Event[];
  segments: ResolvedSegment[];
  approximate: boolean;
  unavailable: boolean;
};

// Chart seed mimicking the mission overview chart
const MISSION_CHART_DATA = [
  { time: "00:00", actual: 310, target: 280 },
  { time: "04:00", actual: 350, target: 290 },
  { time: "08:00", actual: 330, target: 280 },
  { time: "12:00", actual: 370, target: 290 },
  { time: "16:00", actual: 360, target: 275 },
  { time: "20:00", actual: 380, target: 285 },
  { time: "24:00", actual: 355, target: 295 },
  { time: "Now", actual: 400, target: 310 },
];

export function LivePage() {
  const role = useAuth((state) => state.role);
  const allowed = canSearch(role);
  const pushToast = useUi((state) => state.pushToast);
  const client = useQueryClient();
  const mapRef = useRef<MapHandle>(null);

  // Default to Tactical Map directly so map and travel path are immediate centerpiece
  const [activeTab, setActiveTab] = useState<"map" | "dashboard">("map");
  const [selected, setSelected] = useState<string | null>("CAM01");
  const [showOcr, setShowOcr] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [plate, setPlate] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [trajError, setTrajError] = useState<string | null>(null);
  const [trajLoading, setTrajLoading] = useState(false);
  const [trajSegments, setTrajSegments] = useState<ResolvedSegment[]>([]);
  const [pulsed, setPulsed] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<AlertItem[]>([]);

  const camerasQuery = useQuery({ queryKey: ["cameras"], queryFn: listCameras, retry: false });
  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: () => listEvents(),
    refetchInterval: CONFIG.eventsPollMs,
    retry: false,
  });
  const heatQuery = useQuery({ queryKey: ["heatmap"], queryFn: () => getHeatmap(), refetchInterval: 15000, retry: false });
  const alertsQuery = useQuery({ queryKey: ["alerts"], queryFn: listAlerts, refetchInterval: 8000, retry: false });

  const cameras = camerasQuery.data ?? (camerasQuery.isError ? FALLBACK_CAMERAS : NO_CAMERAS);
  const events = eventsQuery.data ?? [];

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let timer = 0;
    const connect = () => {
      socket = new WebSocket(wsUrl("/ws/alerts"));
      socket.onmessage = (message) => {
        try {
          const alert = JSON.parse(message.data) as AlertItem;
          setIncoming((prev) => [alert, ...prev.filter((item) => item.id !== alert.id)].slice(0, 40));
          void client.invalidateQueries({ queryKey: ["alerts"] });
          void client.invalidateQueries({ queryKey: ["events"] });
        } catch { /* skip */ }
      };
      socket.onclose = () => {
        if (!stopped) timer = window.setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [client]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let timer = 0;
    const connect = () => {
      socket = new WebSocket(wsUrl("/ws/events"));
      socket.onmessage = () => {
        void client.invalidateQueries({ queryKey: ["events"] });
      };
      socket.onclose = () => {
        if (!stopped) timer = window.setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [client]);

  const path = useMemo(() => {
    if (!run) return [] as LonLat[];
    const line = flattenPath(
      run.segments.filter((segment) => segment.coordinates.length >= 2).map((segment) => segment.coordinates),
    );
    if (line.length >= 2) return line;
    if (run.events.length === 1) {
      const camera = cameraById(cameras, run.events[0].camera_id);
      if (camera) return [[camera.lon, camera.lat] as LonLat];
    }
    return line;
  }, [run, cameras]);

  const stops = useMemo(() => {
    if (!run) return [];
    return run.events.flatMap((event) => {
      const camera = cameraById(cameras, event.camera_id);
      if (!camera) return [];
      return [{ id: event.event_id, at: [camera.lon, camera.lat] as LonLat, timeMs: new Date(event.timestamp).getTime() }];
    });
  }, [run, cameras]);

  const motion = useAlongPath({ path, stops, playing, speed, runId: run?.id ?? 0 });
  const revealedEvents = run?.events.filter((event) => motion.revealed.includes(event.event_id)) ?? [];
  const seenReveal = useRef<string[]>([]);

  useEffect(() => {
    seenReveal.current = [];
  }, [run?.id]);

  useEffect(() => {
    const fresh = motion.revealed.filter((id) => !seenReveal.current.includes(id));
    seenReveal.current = motion.revealed;
    if (!fresh.length || !run) return;
    setPulsed(run.events.filter((event) => fresh.includes(event.event_id)).map((event) => event.camera_id));
    const timer = window.setTimeout(() => setPulsed([]), 1200);
    return () => window.clearTimeout(timer);
  }, [motion.revealed, run]);

  const heat = useMemo(() => heatBuckets(events, cameras, heatQuery.data?.points ?? []), [events, cameras, heatQuery.data]);

  const drawn = useMemo(() => [...trajSegments, ...(run?.segments ?? [])], [trajSegments, run]);

  const solid = useMemo(
    () =>
      drawn
        .filter((segment) => segment.kind !== "inferred" && segment.coordinates.length >= 2)
        .map((segment) => ({
          id: `obs-${segment.from}-${segment.to}`,
          path: segment.coordinates,
          color: [255, 106, 0, 230] as [number, number, number, number],
        })),
    [drawn],
  );

  const dashed = useMemo(
    () =>
      drawn
        .filter((segment) => segment.kind === "inferred" && segment.coordinates.length >= 2)
        .map((segment) => ({
          id: `inf-${segment.from}-${segment.to}`,
          path: segment.coordinates,
          color: [255, 200, 100, 230] as [number, number, number, number],
        })),
    [drawn],
  );

  const arrows = useMemo(
    () => [...dashed, ...solid].flatMap((segment) => sampleArrows(segment.path)),
    [dashed, solid],
  );

  const labels = useMemo(
    () =>
      drawn.flatMap((segment) => {
        if (segment.kind !== "inferred" || !Array.isArray(segment.coordinates) || segment.coordinates.length < 2) return [];
        const position = midpoint(segment.coordinates);
        if (
          !position ||
          !Array.isArray(position) ||
          position.length < 2 ||
          typeof position[0] !== "number" ||
          typeof position[1] !== "number" ||
          isNaN(position[0]) ||
          isNaN(position[1])
        ) {
          return [];
        }
        return [{ id: `${segment.from}-${segment.to}`, position, text: "inferred" }];
      }),
    [drawn],
  );

  const vehicle = motion.point && run ? { position: motion.point, label: "Simulated" } : null;
  const selectedCamera = selected ? cameraById(cameras, selected) : undefined;

  async function openPlate(next: string) {
    if (!allowed) return;
    setPlate(next);
    setTrajLoading(true);
    setTrajError(null);
    try {
      const data = await getTrajectory(next);
      setTrajectory(data);
      const resolved = await resolveRoads(data.segments, cameras);
      setTrajSegments(resolved);
      const first = data.sightings.find((sighting) => sighting.lon != null && sighting.lat != null);
      if (first?.lon != null && first.lat != null) mapRef.current?.flyTo(first.lon, first.lat);
      setActiveTab("map");
    } catch (err) {
      setTrajectory(null);
      setTrajSegments([]);
      setTrajError(
        err instanceof ApiError && err.status === 403
          ? "Not permitted for your role"
          : err instanceof Error
          ? err.message
          : "Trajectory failed",
      );
    } finally {
      setTrajLoading(false);
    }
  }

  async function simulate(input: { plate: string; preset: PresetId; cameraOrder: string[] }) {
    setBusy(true);
    try {
      const result = await runSimulate({
        plate: input.plate,
        camera_order: input.cameraOrder,
        start_time: new Date().toISOString(),
        speed_factor: 1,
        jitter_pct: 0.05,
        preset: input.preset,
      });
      const segments = await resolveRoads(result.segments, cameras);
      const drawable = flattenPath(
        segments.filter((segment) => segment.coordinates.length >= 2).map((segment) => segment.coordinates),
      );
      if (result.events.length > 1 && drawable.length < 2) {
        pushToast("Road geometry unavailable", "error");
      }
      setRun({
        id: Date.now(),
        events: result.events,
        segments,
        approximate: segments.some((segment) => segment.approximate),
        unavailable: segments.some((segment) => segment.unavailable),
      });
      setPlaying(true);
      setActiveTab("map");
      if (input.cameraOrder[0]) {
        setSelected(input.cameraOrder[0]);
        setShowOcr(true);
      }
    } catch (err) {
      pushToast(err instanceof ApiError ? err.detail : "Simulate failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // Preload and auto-animate the Hero mock travel path on mount
  const autoSimRef = useRef(false);
  useEffect(() => {
    if (autoSimRef.current || cameras.length === 0) return;
    autoSimRef.current = true;
    void simulate({
      plate: "TS09VN2612",
      preset: "normal_trip",
      cameraOrder: ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
    });
  }, [cameras]);

  function openAlert(alert: AlertItem) {
    const camera = cameraById(cameras, alert.camera_id);
    if (camera) mapRef.current?.flyTo(camera.lon, camera.lat);
    if (allowed) void openPlate(alert.plate_text);
  }

  const includesSim = events.some((event) => event.source === "simulated" || event.source === "synthetic");

  return (
    <div className="relative h-full flex flex-col bg-tac-bg text-tac-text overflow-hidden">
      {/* Subheader Toolbar with Live Corridor Telemetry and Preset Triggers */}
      <div className="min-h-12 border-b border-tac-border px-4 py-2 flex flex-wrap items-center justify-between bg-tac-bg shrink-0 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Hitech City: Financial District Corridor
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-tac-text-dim border-l border-tac-border pl-3">
            <span className="text-emerald-400 font-bold">5/5 ONLINE</span>
            <span>|</span>
            <span>{events.length} SIGHTINGS</span>
            <span>|</span>
            <span className={incoming.length > 0 ? "text-tac-accent font-bold" : ""}>
              {incoming.length} ALERTS
            </span>
            {run && (
              <>
                <span>|</span>
                <span className="text-tac-accent font-bold uppercase">
                  ACTIVE: {run.events[0]?.plate_text ?? "HERO"} ({playing ? "MOVING" : "STOPPED"})
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Mock Scenarios */}
          <div className="flex items-center gap-1.5 bg-tac-inner border border-tac-border p-1 rounded">
            <span className="text-[9px] uppercase font-bold text-tac-text-muted px-1 hidden md:inline">
              Mock Paths:
            </span>
            <button
              onClick={() => {
                setActiveTab("map");
                void simulate({
                  plate: "TS09VN2612",
                  preset: "normal_trip",
                  cameraOrder: ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
                });
              }}
              className="px-2 py-1 text-[9px] font-mono font-bold rounded bg-tac-surface border border-tac-border hover:border-tac-accent hover:text-white transition-colors text-tac-text"
              title="Simulate Hero Vehicle across CAM01 to CAM05"
            >
              &#x25B6; Hero Path (CAM01-05)
            </button>

            <button
              onClick={() => {
                setActiveTab("map");
                void simulate({
                  plate: "TS09CL0001",
                  preset: "cloned_plate",
                  cameraOrder: ["CAM01", "CAM05"],
                });
              }}
              className="px-2 py-1 text-[9px] font-mono font-bold rounded bg-tac-surface border border-tac-border hover:border-amber-500 hover:text-amber-400 transition-colors text-tac-text"
              title="Simulate Cloned Plate Anomaly (CAM01 to CAM05 in 90s)"
            >
              &#x26A1; Cloned Plate
            </button>

            <button
              onClick={() => {
                setActiveTab("map");
                void simulate({
                  plate: "TS09VN2612",
                  preset: "fuzzy_plate",
                  cameraOrder: ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
                });
              }}
              className="px-2 py-1 text-[9px] font-mono font-bold rounded bg-tac-surface border border-tac-border hover:border-blue-500 hover:text-blue-400 transition-colors text-tac-text"
              title="Simulate Fuzzy Plate Match with single character diff"
            >
              &#x26A0; Fuzzy Match
            </button>

            <button
              onClick={() => mapRef.current?.fit()}
              className="px-2 py-1 text-[9px] font-mono font-bold rounded bg-tac-surface border border-tac-border hover:text-white transition-colors text-tac-text-muted"
              title="Reset map view to fit all corridor cameras"
            >
              &#x27F3; Fit
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 rounded">
            <button
              onClick={() => setActiveTab("map")}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
                activeTab === "map"
                  ? "bg-tac-accent text-black font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Tactical Map
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
                activeTab === "dashboard"
                  ? "bg-tac-accent text-black font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Overview
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-auto">
        {activeTab === "dashboard" ? (
          /* ================= TACTICAL OPS COMMAND DASHBOARD ================= */
          <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Top Row: 3 Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: AGENT ALLOCATION */}
              <div className="tac-card rounded-lg p-5 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                    Agent Allocation
                  </div>

                  <div className="grid grid-cols-3 gap-2 pb-4 border-b border-tac-border">
                    <div>
                      <div className="text-[26px] font-bold font-mono text-tac-text">190</div>
                      <div className="text-[9px] uppercase tracking-wider text-tac-text-muted mt-0.5">
                        Active Field
                      </div>
                    </div>
                    <div>
                      <div className="text-[26px] font-bold font-mono text-tac-text">990</div>
                      <div className="text-[9px] uppercase tracking-wider text-tac-text-muted mt-0.5">
                        Undercover
                      </div>
                    </div>
                    <div>
                      <div className="text-[26px] font-bold font-mono text-tac-text">290</div>
                      <div className="text-[9px] uppercase tracking-wider text-tac-text-muted mt-0.5">
                        Training
                      </div>
                    </div>
                  </div>

                  {/* Camera Roster */}
                  <div className="mt-4 space-y-2.5">
                    {cameras.slice(0, 5).map((cam) => (
                      <div
                        key={cam.camera_id}
                        onClick={() => {
                          setSelected(cam.camera_id);
                          setShowOcr(true);
                          mapRef.current?.flyTo(cam.lon, cam.lat);
                          setActiveTab("map");
                        }}
                        className="p-2.5 bg-tac-inner border border-tac-border-bright rounded-lg flex items-center justify-between cursor-pointer hover:border-tac-accent/60 transition-colors"
                      >
                        <div>
                          <div className="text-[11px] font-bold font-mono text-tac-text">
                            {cam.camera_id}
                          </div>
                          <div className="text-[9px] uppercase tracking-widest text-tac-text-dim mt-0.5">
                            {cam.name}
                          </div>
                        </div>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            cam.status === "online" ? "bg-tac-text" : "bg-tac-red"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: ACTIVITY LOG */}
              <div className="tac-card rounded-lg p-5 flex flex-col">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                  Activity Log
                </div>
                <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[340px] pr-2">
                  {events.slice(0, 8).map((evt) => (
                    <div key={evt.event_id} className="text-[11px] border-l-2 border-tac-border pl-3 space-y-1">
                      <div className="text-tac-accent font-mono text-[10px] font-semibold">
                        {formatIst(evt.timestamp)}
                      </div>
                      <div className="text-tac-text font-mono text-[11px] leading-relaxed">
                        Plate <span className="font-bold text-white">{evt.plate_text}</span> registered at {evt.camera_id} ({Math.round(evt.plate_confidence * 100)}% conf)
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div className="text-tac-text-muted font-mono text-xs py-8 text-center">
                      Waiting for camera detections. Trigger a simulation or replay.
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: ENCRYPTED RADAR ACTIVITY */}
              <div className="tac-card rounded-lg p-5 flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-3">
                  Encrypted Radar Activity
                </div>

                <div className="flex justify-center my-2">
                  <div className="relative w-36 h-36 rounded-full border border-zinc-700 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full border border-zinc-800 absolute" />
                    <div className="w-12 h-12 rounded-full border border-zinc-800 absolute" />
                    <div className="w-full h-px bg-zinc-800 absolute" />
                    <div className="h-full w-px bg-zinc-800 absolute" />
                    <div className="absolute inset-0 rounded-full animate-spin" style={{ animationDuration: "4s" }}>
                      <div className="w-1/2 h-0.5 bg-gradient-to-r from-transparent to-tac-accent origin-right" />
                    </div>
                    <div className="w-2 h-2 rounded-full bg-tac-accent animate-ping" />
                  </div>
                </div>

                <div className="bg-[#0d0d0d] border border-tac-border p-3.5 rounded-lg font-mono text-[10px] space-y-1.5 mt-2">
                  <div className="text-zinc-500"># 2026-10-10 12:20 IST</div>
                  <div className="text-tac-text">&gt; [NETRA:HYD-CORRIDOR] ::: 5 CAMERAS STREAMING</div>
                  <div className="text-tac-accent">&gt; ANPR SYNC | HITEC - FINANCIAL DISTRICT</div>
                  <div className="text-zinc-400">&gt; OSRM CACHE LOADED (ROADS SNAPPED)</div>
                  <div className="text-zinc-300">&gt; MSG &gt;&gt; &quot;Ready for live multi-camera plate tracking&quot;</div>
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 tac-card rounded-lg p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                  Corridor Activity Overview
                </div>
                <div className="h-60 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={MISSION_CHART_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="time" stroke="#555" fontSize={10} fontFamily="monospace" />
                      <YAxis stroke="#555" fontSize={10} fontFamily="monospace" domain={[150, 500]} />
                      <Tooltip
                        contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "11px", fontFamily: "monospace" }}
                      />
                      <Area type="monotone" dataKey="actual" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.12} />
                      <Line type="monotone" dataKey="target" stroke="#a3a3a3" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between items-center text-[10px] text-tac-text-muted mt-2 font-mono px-4">
                  <span>Hitech City</span>
                  <span>Financial District</span>
                </div>
              </div>

              <div className="tac-card rounded-lg p-5 flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                  Mission Statistics
                </div>

                <div className="space-y-6">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-tac-text">
                      <span className="w-2 h-2 rounded-full bg-white" />
                      <span>Plate Tracking Accuracy</span>
                    </div>
                    <div className="space-y-2 text-[10px] pl-4 font-mono text-tac-text-dim">
                      <div className="flex justify-between">
                        <span>High Confidence (&gt;90%)</span>
                        <span className="text-white font-bold">190</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Medium Confidence</span>
                        <span className="text-white font-bold">426</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fuzzy Plate Matches</span>
                        <span className="text-white font-bold">12</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-tac-border">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-tac-red">
                      <span className="w-2 h-2 rounded-full bg-tac-red" />
                      <span>Security Watchlist</span>
                    </div>
                    <div className="space-y-2 text-[10px] pl-4 font-mono text-tac-text-dim">
                      <div className="flex justify-between">
                        <span>Watchlist Plates</span>
                        <span className="text-white font-bold">3</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Trajectories</span>
                        <span className="text-white font-bold">1</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cloned Plate Violations</span>
                        <span className="text-white font-bold">1</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab("map")}
                  className="tac-btn w-full mt-4 justify-center py-2 text-[10px] font-bold"
                >
                  Return to Tactical Map &gt;&gt;
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ================= FULL TACTICAL MAP WITH DATA & TOP-RIGHT OCR ================= */
          <div className="relative w-full h-full">
            <MapView
              ref={mapRef}
              cameras={cameras}
              selectedId={selected}
              pulsedIds={pulsed}
              onSelect={(id) => {
                setSelected(id);
                setShowOcr(true);
              }}
              heatReal={heat.real}
              heatSim={heat.sim}
              heatSynth={heat.synth}
              solid={solid}
              dashed={dashed}
              arrows={arrows}
              labels={labels}
              vehicle={vehicle}
              onStyleError={setMapError}
            />

            {/* Left Drawer Panels: Search, Simulation Player, Trajectory, Watchlist */}
            <div className="absolute left-4 top-4 z-10 hidden w-[340px] max-h-[calc(100%-80px)] space-y-3 overflow-y-auto lg:block scrollbar-none">
              {allowed ? (
                <>
                  <SearchPanel events={events} onOpen={(value) => void openPlate(value)} />
                  <SimulatePanel
                    busy={busy}
                    active={Boolean(run)}
                    playing={playing}
                    speed={speed}
                    approximate={Boolean(run?.approximate)}
                    unavailable={Boolean(run?.unavailable)}
                    onSimulate={(input) => void simulate(input)}
                    onToggle={() => setPlaying((value) => !value)}
                    onRestart={() => setRun((current) => (current ? { ...current, id: Date.now() } : current))}
                    onSpeed={setSpeed}
                  />
                  <WatchlistPanel />
                </>
              ) : null}
              {plate ? (
                <TrajectoryPanel
                  plate={plate}
                  matchType={trajectory?.match_type ?? null}
                  sightings={trajectory?.sightings ?? []}
                  segments={trajSegments}
                  cameras={cameras}
                  loading={trajLoading}
                  error={trajError}
                  onClose={() => {
                    setPlate(null);
                    setTrajectory(null);
                    setTrajSegments([]);
                  }}
                />
              ) : null}
            </div>

            {/* Right Panel: NUMBER PLATE RECOGNITION (TOP RIGHT) + Sightings Stream */}
            <div className="absolute right-4 top-4 z-10 hidden w-[380px] max-h-[calc(100%-80px)] space-y-3 overflow-y-auto lg:block scrollbar-none">
              {/* Relocated Number Plate Recognition (ANPR / OCR) */}
              {selectedCamera && showOcr && (
                <OcrPanel
                  cameraId={selectedCamera.camera_id}
                  cameraName={selectedCamera.name}
                  events={events}
                  cameras={cameras}
                  onSelectCamera={(id) => {
                    setSelected(id);
                    const cam = cameraById(cameras, id);
                    if (cam) mapRef.current?.flyTo(cam.lon, cam.lat);
                  }}
                  onClose={() => setShowOcr(false)}
                />
              )}

              {!showOcr && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowOcr(true)}
                    className="tac-btn py-1 px-3 text-[10px] font-mono font-bold"
                  >
                    &#x25C9; Show Plate Recognition
                  </button>
                </div>
              )}

              {/* Sightings Stream */}
              <Panel title="Sightings Stream">
                {!run ? (
                  <EmptyState
                    title="No active journey"
                    detail="Simulated sightings appear here as the vehicle traverses cameras."
                  />
                ) : null}
                {run && revealedEvents.length === 0 ? (
                  <p className="text-xs text-white/60">Waiting for vehicle to reach camera...</p>
                ) : null}
                <ul className="space-y-2">
                  {revealedEvents.map((event) => (
                    <li
                      key={event.event_id}
                      onClick={() => {
                        setSelected(event.camera_id);
                        setShowOcr(true);
                        const cam = cameraById(cameras, event.camera_id);
                        if (cam) mapRef.current?.flyTo(cam.lon, cam.lat);
                      }}
                      className="rounded border border-tac-border p-2 bg-tac-surface hover:border-tac-accent/70 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-tac-text">{event.plate_text}</p>
                        <SourceTag source={event.source} />
                      </div>
                      <p className="text-[10px] text-tac-text-dim mt-0.5">
                        {event.camera_id} · {Math.round(event.plate_confidence * 100)}%
                      </p>
                      <p className="font-mono text-[9px] text-tac-text-muted">{formatIst(event.timestamp)}</p>
                    </li>
                  ))}
                </ul>
              </Panel>

              {/* Corridor Legend */}
              <Legend includesSim={includesSim} unlabeled={heat.unlabeled} />
            </div>

            {/* Bottom Floating Camera Quick Selector Bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-tac-surface/90 backdrop-blur-md border border-tac-border px-3 py-1.5 rounded-full shadow-lg">
              <span className="text-[9px] font-mono uppercase text-tac-text-muted font-bold mr-1">
                Cameras:
              </span>
              {cameras.map((cam) => (
                <button
                  key={cam.camera_id}
                  onClick={() => {
                    setSelected(cam.camera_id);
                    setShowOcr(true);
                    mapRef.current?.flyTo(cam.lon, cam.lat);
                  }}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                    selected === cam.camera_id
                      ? "bg-tac-accent text-black font-extrabold"
                      : "bg-tac-inner text-tac-text-dim hover:text-white border border-tac-border"
                  }`}
                >
                  {cam.camera_id}
                </button>
              ))}
              <button
                onClick={() => mapRef.current?.fit()}
                className="ml-2 text-[10px] text-tac-text-muted hover:text-white font-mono px-2 py-0.5 border-l border-tac-border"
              >
                Fit All
              </button>
            </div>

            {mapError ? (
              <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-xs text-tac-red bg-black/80 px-4 py-1 rounded">
                {mapError}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Live Alerts Stack */}
      <AlertsStack incoming={incoming} history={alertsQuery.data ?? []} events={events} onOpen={openAlert} />
    </div>
  );
}

function Legend({ includesSim, unlabeled }: { includesSim: boolean; unlabeled: boolean }) {
  return (
    <Panel title="Legend">
      <ul className="space-y-1 text-[11px] text-white/70 font-mono">
        <li>Solid line: observed segment</li>
        <li>Dashed line: inferred segment</li>
        {includesSim ? <li className="text-tac-accent">Includes simulated data</li> : null}
        {unlabeled ? <li>Heatmap source fallback</li> : null}
      </ul>
    </Panel>
  );
}

function heatBuckets(
  events: Event[],
  cameras: { camera_id: string; lon: number; lat: number }[],
  fallback: { lat: number; lon: number; weight: number; camera_id: string }[],
) {
  const real = new Map<string, number>();
  const sim = new Map<string, number>();
  const synth = new Map<string, number>();
  events.forEach((event) => {
    const bucket = event.source === "simulated" ? sim : event.source === "synthetic" ? synth : real;
    bucket.set(event.camera_id, (bucket.get(event.camera_id) ?? 0) + 1);
  });
  const toPoints = (bucket: Map<string, number>) =>
    [...bucket.entries()].flatMap(([id, weight]) => {
      const camera = cameras.find((item) => item.camera_id === id);
      if (!camera) return [];
      return [{ position: [camera.lon, camera.lat] as LonLat, weight }];
    });
  if (events.length === 0 && fallback.length) {
    return {
      real: fallback.map((point) => ({ position: [point.lon, point.lat] as LonLat, weight: point.weight })),
      sim: [],
      synth: [],
      unlabeled: true,
    };
  }
  return { real: toPoints(real), sim: toPoints(sim), synth: toPoints(synth), unlabeled: false };
}
