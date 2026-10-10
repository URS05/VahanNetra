import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function LivePage() {
  const role = useAuth((state) => state.role);
  const allowed = canSearch(role);
  const pushToast = useUi((state) => state.pushToast);
  const client = useQueryClient();
  const mapRef = useRef<MapHandle>(null);
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
        const alert = JSON.parse(message.data) as AlertItem;
        setIncoming((prev) => [alert, ...prev.filter((item) => item.id !== alert.id)].slice(0, 40));
        void client.invalidateQueries({ queryKey: ["alerts"] });
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
          color: [125, 211, 252, 230] as [number, number, number, number],
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
          color: [253, 224, 171, 230] as [number, number, number, number],
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
      setPlate(null);
      setTrajectory(null);
      setTrajSegments([]);
      void client.invalidateQueries({ queryKey: ["events"] });
      void client.invalidateQueries({ queryKey: ["alerts"] });
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
    <div className="relative h-full">
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
      <div className="absolute left-3 top-3 z-10 hidden w-[340px] max-h-[calc(100%-24px)] space-y-2 overflow-auto lg:block">
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
      <div className="absolute right-3 top-24 z-10 hidden w-[320px] max-h-[calc(100%-180px)] space-y-2 overflow-auto lg:block">
        <Panel title="Sightings">
          {!run ? <EmptyState title="No data yet" detail="Simulated sightings appear here when the marker reaches each camera." /> : null}
          {run && revealedEvents.length === 0 ? <p className="text-xs text-white/60">Waiting for the vehicle to reach a camera.</p> : null}
          <ul className="space-y-2">
            {revealedEvents.map((event) => (
              <li key={event.event_id} className="rounded-xl border border-white/10 p-2">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm">{event.plate_text}</p>
                  <SourceTag source={event.source} />
                </div>
                <p className="text-xs text-white/70">{event.camera_id} · {Math.round(event.plate_confidence * 100)}%</p>
                <p className="font-mono text-[11px] text-white/50">{formatIst(event.timestamp)}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Legend includesSim={includesSim} unlabeled={heat.unlabeled} />
      </div>
      <div className="absolute bottom-3 left-3 z-10 flex gap-2 lg:hidden">
        {allowed ? <Button variant="ghost" onClick={() => setDrawer(drawer === "tools" ? null : "tools")}>Tools</Button> : null}
        <Button variant="ghost" onClick={() => setDrawer(drawer === "feed" ? null : "feed")}>Feed</Button>
        <Button variant="ghost" onClick={() => mapRef.current?.fit()}>Fit</Button>
      </div>
      {drawer ? (
        <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70%] overflow-auto bg-black/80 p-3 backdrop-blur lg:hidden">
          <Button variant="ghost" onClick={() => setDrawer(null)}>Close</Button>
          {drawer === "tools" && allowed ? (
            <div className="mt-2 space-y-2">
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
            </div>
          ) : null}
          {drawer === "feed" ? (
            <Panel title="Sightings">
              {revealedEvents.length === 0 ? <EmptyState title="No data yet" /> : null}
              {revealedEvents.map((event) => (
                <p key={event.event_id} className="font-mono text-sm">{event.plate_text} <SourceTag source={event.source} /></p>
              ))}
            </Panel>
          ) : null}
        </div>
      ) : null}
      <div className="absolute bottom-16 left-3 z-10 hidden lg:block">
        <Button variant="ghost" onClick={() => mapRef.current?.fit()}>Fit to cameras</Button>
      </div>
      {selectedCamera ? (
        <div className="absolute inset-x-3 bottom-3 z-10 hidden lg:block">
          <OcrPanel cameraId={selectedCamera.camera_id} cameraName={selectedCamera.name} events={events} />
        </div>
      ) : null}
      {selectedCamera && drawer === null ? (
        <div className="absolute inset-x-3 bottom-16 z-10 lg:hidden">
          <OcrPanel cameraId={selectedCamera.camera_id} cameraName={selectedCamera.name} events={events} />
        </div>
      ) : null}
      <AlertsStack incoming={incoming} history={alertsQuery.data ?? []} events={events} onOpen={openAlert} />
      {camerasQuery.isError ? (
        <p className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs">
          Using local camera list because the API camera endpoint failed. Verify coordinates.
        </p>
      ) : null}
      {mapError ? <p className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-xs text-red-200">{mapError}</p> : null}
    </div>
  );
}

function Legend({ includesSim, unlabeled }: { includesSim: boolean; unlabeled: boolean }) {
  return (
    <Panel title="Legend">
      <ul className="space-y-1 text-xs text-white/70">
        <li>Solid line: observed segment</li>
        <li>Dashed line, labeled inferred</li>
        {includesSim ? <li>Includes simulated data</li> : null}
        {unlabeled ? <li>Heatmap source was not returned for some points</li> : null}
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
