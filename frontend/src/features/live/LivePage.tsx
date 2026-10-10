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
import { Button } from "../../components/ui/Button";
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

  const [activeTab, setActiveTab] = useState<"dashboard" | "map">("dashboard");
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"tools" | "feed" | null>(null);
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
        if (segment.kind !== "inferred" || segment.coordinates.length < 2) return [];
        const position = midpoint(segment.coordinates);
        if (!position) return [];
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
      setTrajError(err instanceof ApiError && err.status === 403 ? "Not permitted for your role" : err instanceof Error ? err.message : "Trajectory failed");
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
      const drawable = flattenPath(segments.filter((segment) => segment.coordinates.length >= 2).map((segment) => segment.coordinates));
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
    } catch (err) {
      pushToast(err instanceof ApiError ? err.detail : "Simulate failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function openAlert(alert: AlertItem) {
    const camera = cameraById(cameras, alert.camera_id);
    if (camera) mapRef.current?.flyTo(camera.lon, camera.lat);
    if (allowed) void openPlate(alert.plate_text);
  }

  const includesSim = events.some((event) => event.source === "simulated" || event.source === "synthetic");

  return (
    <div className="relative h-full flex flex-col bg-tac-bg text-tac-text overflow-hidden">
      {/* Subheader Toolbar */}
      <div className="h-12 border-b border-tac-border px-6 flex items-center justify-between bg-tac-bg shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[14px] font-bold uppercase tracking-[0.12em] text-tac-text">
            Command Center
          </span>
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 rounded">
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
          </div>
        </div>

        <div className="flex items-center gap-3">
          {allowed && (
            <button
              onClick={() => {
                setActiveTab("map");
                setDrawer(drawer === "tools" ? null : "tools");
              }}
              className="tac-btn py-1.5 px-3 text-[10px] font-bold"
            >
              &#x25B6; Simulate Journey
            </button>
          )}
          <button
            onClick={() => {
              setActiveTab("map");
              setDrawer(drawer === "feed" ? null : "feed");
            }}
            className="tac-btn-outline tac-btn py-1.5 px-3 text-[10px] font-bold"
          >
            &#x25CE; Live Sightings
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 relative overflow-auto">
        {activeTab === "dashboard" ? (
          /* ================= SCREENSHOT 2 & 3: TACTICAL OPS COMMAND DASHBOARD ================= */
          <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Top Row: 3 Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: AGENT ALLOCATION matching Screenshot 2/3 */}
              <div className="tac-card rounded-lg p-5 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                    Agent Allocation
                  </div>

                  {/* 3 Top Numbers */}
                  <div className="grid grid-cols-3 gap-2 pb-4 border-b border-tac-border">
                    <div>
                      <div className="text-[26px] font-bold font-mono text-tac-text">
                        190
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-tac-text-muted mt-0.5">
                        Active Field
                      </div>
                    </div>
                    <div>
                      <div className="text-[26px] font-bold font-mono text-tac-text">
                        990
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-tac-text-muted mt-0.5">
                        Undercover
                      </div>
                    </div>
                    <div>
                      <div className="text-[26px] font-bold font-mono text-tac-text">
                        290
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-tac-text-muted mt-0.5">
                        Training
                      </div>
                    </div>
                  </div>

                  {/* Roster list matching Screenshot 2 */}
                  <div className="mt-4 space-y-2.5">
                    {[
                      { id: "G-078W", name: "VENGEFUL SPIRIT", status: "active" },
                      { id: "G-079X", name: "OBSIDIAN SENTINEL", status: "standby" },
                      { id: "G-080Y", name: "GHOSTLY FURY", status: "active" },
                      { id: "G-081Z", name: "CURSED REVENANT", status: "compromised" },
                    ].map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 bg-tac-inner border border-tac-border-bright rounded-lg flex items-center justify-between cursor-pointer hover:border-tac-accent/60 transition-colors"
                      >
                        <div>
                          <div className="text-[11px] font-bold font-mono text-tac-text">
                            {item.id}
                          </div>
                          <div className="text-[9px] uppercase tracking-widest text-tac-text-dim mt-0.5">
                            {item.name}
                          </div>
                        </div>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.status === "compromised"
                              ? "bg-tac-red"
                              : item.status === "standby"
                              ? "bg-zinc-500"
                              : "bg-tac-text"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: ACTIVITY LOG matching Screenshot 2 */}
              <div className="tac-card rounded-lg p-5 flex flex-col">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                  Activity Log
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 max-h-[340px] pr-2">
                  <div className="text-[11px] space-y-1">
                    <div className="text-tac-accent font-mono text-[10px] font-semibold">
                      25/06/2025 09:29
                    </div>
                    <div className="text-tac-text font-mono text-[11px] leading-relaxed">
                      Agent <span className="font-bold text-tac-accent">gh0st_Fire</span> completed mission in Berlin with agent <span className="text-tac-accent">zer0_Nigh</span>
                    </div>
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div className="text-tac-accent font-mono text-[10px] font-semibold">
                      25/06/2025 08:12
                    </div>
                    <div className="text-tac-text font-mono text-[11px] leading-relaxed">
                      Agent <span className="font-bold text-tac-accent">dr4g0n_V3in</span> extracted high-value target in Cairo
                    </div>
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div className="text-tac-accent font-mono text-[10px] font-semibold">
                      24/06/2025 22:55
                    </div>
                    <div className="text-tac-text font-mono text-[11px] leading-relaxed">
                      Agent <span className="font-bold text-tac-accent">sn4ke_Sh4de</span> lost communication in Havana
                    </div>
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div className="text-tac-accent font-mono text-[10px] font-semibold">
                      24/06/2025 21:33
                    </div>
                    <div className="text-tac-text font-mono text-[11px] leading-relaxed">
                      Agent <span className="font-bold text-tac-accent">ph4nt0m_R4ven</span> initiated surveillance in Tokyo
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: ENCRYPTED CHAT ACTIVITY matching Screenshot 2 */}
              <div className="tac-card rounded-lg p-5 flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-3">
                  Encrypted Chat Activity
                </div>

                {/* Radar Graphic */}
                <div className="flex justify-center my-2">
                  <div className="relative w-36 h-36 rounded-full border border-zinc-700 flex items-center justify-center">
                    {/* Concentric rings */}
                    <div className="w-24 h-24 rounded-full border border-zinc-800 absolute" />
                    <div className="w-12 h-12 rounded-full border border-zinc-800 absolute" />
                    {/* Crosshairs */}
                    <div className="w-full h-px bg-zinc-800 absolute" />
                    <div className="h-full w-px bg-zinc-800 absolute" />
                    {/* Sweeping line */}
                    <div className="absolute inset-0 rounded-full animate-spin" style={{ animationDuration: "4s" }}>
                      <div className="w-1/2 h-0.5 bg-gradient-to-r from-transparent to-tac-accent origin-right" />
                    </div>
                    {/* Center blip */}
                    <div className="w-2 h-2 rounded-full bg-tac-accent animate-ping" />
                  </div>
                </div>

                {/* Terminal Console Text matching Screenshot 2 */}
                <div className="bg-[#0d0d0d] border border-tac-border p-3.5 rounded-lg font-mono text-[10px] space-y-1.5 mt-2">
                  <div className="text-zinc-500"># 2025-06-17 14:23 UTC</div>
                  <div className="text-tac-text">&gt; [AGT:gh0stfire] ::: INIT &gt;&gt; ^^^ loading secure channel</div>
                  <div className="text-tac-accent">&gt; CH#2 | 1231.9082464.500...xR3</div>
                  <div className="text-zinc-400">&gt; KEY LOCKED</div>
                  <div className="text-zinc-300">&gt; MSG &gt;&gt; &quot;...mission override initiated... awaiting delta node clearance&quot;</div>
                </div>
              </div>
            </div>

            {/* Bottom Row: 2 Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left: MISSION ACTIVITY OVERVIEW */}
              <div className="md:col-span-2 tac-card rounded-lg p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                  Mission Activity Overview
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
                  <span>Jan 28, 2025</span>
                  <span>Feb 28, 2025</span>
                </div>
              </div>

              {/* Right: MISSION INFORMATION matching Screenshot 2/3 */}
              <div className="tac-card rounded-lg p-5 flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-tac-text-dim mb-4">
                  Mission Information
                </div>

                <div className="space-y-6">
                  {/* Successful Missions */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-tac-text">
                      <span className="w-2 h-2 rounded-full bg-white" />
                      <span>Successful Missions</span>
                    </div>
                    <div className="space-y-2 text-[10px] pl-4 font-mono text-tac-text-dim">
                      <div className="flex justify-between">
                        <span>High Risk Mission</span>
                        <span className="text-white font-bold">190</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Medium Risk Mission</span>
                        <span className="text-white font-bold">426</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Low Risk Mission</span>
                        <span className="text-white font-bold">920</span>
                      </div>
                    </div>
                  </div>

                  {/* Failed Missions */}
                  <div className="space-y-2.5 pt-3 border-t border-tac-border">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-tac-red">
                      <span className="w-2 h-2 rounded-full bg-tac-red" />
                      <span>Failed Missions</span>
                    </div>
                    <div className="space-y-2 text-[10px] pl-4 font-mono text-tac-text-dim">
                      <div className="flex justify-between">
                        <span>High Risk Mission</span>
                        <span className="text-white font-bold">190</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Medium Risk Mission</span>
                        <span className="text-white font-bold">426</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Low Risk Mission</span>
                        <span className="text-white font-bold">920</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab("map")}
                  className="tac-btn w-full mt-4 justify-center py-2 text-[10px] font-bold"
                >
                  Open Tactical Map &gt;&gt;
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ================= FULL TACTICAL MAP VIEW ================= */
          <div className="relative w-full h-full">
            <MapView
              ref={mapRef}
              cameras={cameras}
              selectedId={selected}
              pulsedIds={pulsed}
              onSelect={setSelected}
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

            {/* Left Drawer Panels */}
            <div className="absolute left-4 top-4 z-10 hidden w-[340px] max-h-[calc(100%-32px)] space-y-3 overflow-auto lg:block">
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

            {/* Right Feed Panel */}
            <div className="absolute right-4 top-4 z-10 hidden w-[320px] max-h-[calc(100%-120px)] space-y-3 overflow-auto lg:block">
              <Panel title="Sightings Stream">
                {!run ? <EmptyState title="No active journey" detail="Simulated sightings appear here as the vehicle traverses cameras." /> : null}
                {run && revealedEvents.length === 0 ? <p className="text-xs text-white/60">Waiting for vehicle to reach camera...</p> : null}
                <ul className="space-y-2">
                  {revealedEvents.map((event) => (
                    <li key={event.event_id} className="rounded border border-tac-border p-2 bg-tac-surface">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-tac-text">{event.plate_text}</p>
                        <SourceTag source={event.source} />
                      </div>
                      <p className="text-[10px] text-tac-text-dim mt-0.5">{event.camera_id} · {Math.round(event.plate_confidence * 100)}%</p>
                      <p className="font-mono text-[9px] text-tac-text-muted">{formatIst(event.timestamp)}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Legend includesSim={includesSim} unlabeled={heat.unlabeled} />
            </div>

            {/* Map fit button */}
            <div className="absolute bottom-6 left-4 z-10 hidden lg:block">
              <Button variant="ghost" onClick={() => mapRef.current?.fit()} className="text-[11px] font-mono">
                Fit to cameras
              </Button>
            </div>

            {/* Selected Camera OCR overlay */}
            {selectedCamera ? (
              <div className="absolute inset-x-4 bottom-4 z-10 hidden lg:block max-w-4xl mx-auto">
                <OcrPanel cameraId={selectedCamera.camera_id} cameraName={selectedCamera.name} events={events} />
              </div>
            ) : null}

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
