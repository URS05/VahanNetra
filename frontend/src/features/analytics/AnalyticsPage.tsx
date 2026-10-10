import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCongestion, getDensity, getOd, getSpeed } from "../../api/analytics";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import { EndpointMissing, endpointLabel } from "../../components/EndpointMissing";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { Skeleton } from "../../components/ui/Skeleton";
import { analyticsSpeedBySegment, analyticsSpeedOverTime } from "../../api/missing";
import { CONFIG } from "../../config";
import { cameraById } from "../../config/cameras";
import { formatIst, rangeFrom } from "../../lib/format";
import type { Camera } from "../../api/types";

type RangeKey = "1h" | "24h" | "7d";

export function AnalyticsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const range = rangeFrom(rangeKey);
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: listCameras, retry: false });
  const events = useQuery({ queryKey: ["events"], queryFn: () => listEvents(), retry: false });
  const density = useQuery({
    queryKey: ["density", range.from, range.to],
    queryFn: () => getDensity(range.from, range.to),
    retry: false,
  });
  const speed = useQuery({ queryKey: ["speed"], queryFn: getSpeed, retry: false });
  const speedSegments = useQuery({ queryKey: ["speed-segments"], queryFn: analyticsSpeedBySegment, retry: false });
  const speedTime = useQuery({ queryKey: ["speed-time"], queryFn: analyticsSpeedOverTime, retry: false });
  const od = useQuery({ queryKey: ["od"], queryFn: getOd, retry: false });
  const congestion = useQuery({ queryKey: ["congestion"], queryFn: getCongestion, retry: false });

  const includesSim = (events.data ?? []).some(
    (event) => event.source === "simulated" || event.source === "synthetic",
  );
  const loaded = (events.data ?? []).filter((event) => {
    const time = new Date(event.timestamp).getTime();
    return time >= new Date(range.from).getTime() && time <= new Date(range.to).getTime();
  });
  const speedValues = Object.values(speed.data?.average_speed_kmh ?? {}).filter(
    (value): value is number => typeof value === "number",
  );
  const top = congestion.data?.hotspots[0];
  const topCamera = top && cameras.data ? cameraById(cameras.data, top.camera_id) : undefined;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-xs text-white/50">Time range applies to density and the loaded sightings card. Speed, flows and congestion use the full dataset the API returns.</p>
        </div>
        <div className="flex gap-2">
          {(["1h", "24h", "7d"] as RangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded-pill px-3 py-1 text-sm ${rangeKey === key ? "bg-white text-black" : "border border-white/15"}`}
              onClick={() => setRangeKey(key)}
            >
              {key === "1h" ? "Last hour" : key === "24h" ? "24 hours" : "7 days"}
            </button>
          ))}
        </div>
      </div>
      {includesSim ? <div className="mb-3"><Badge tone="live">Includes simulated data</Badge></div> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Cameras" value={cameras.data ? String(cameras.data.length) : cameras.isError ? "No data yet" : null} />
        <Kpi label="Loaded sightings in range" value={events.data ? String(loaded.length) : events.isError ? "No data yet" : null} />
        <Kpi label="Mean speed km/h" value={speed.data ? (speedValues.length ? String(round(avg(speedValues))) : "No data yet") : speed.isError ? "No data yet" : null} />
        <Kpi label="Top congestion score" value={congestion.data ? (top ? String(top.score) : "No data yet") : congestion.isError ? "No data yet" : null} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Density by camera" description="Counts from the density endpoint, summed per camera." query={density}>
          <DensityBars data={density.data?.by_camera} />
        </ChartCard>
        <ChartCard title="Density over time" description="Hour buckets returned by the density endpoint." query={density}>
          <DensityArea data={density.data?.by_camera} />
        </ChartCard>
        <ChartCard title="Average speed by camera" description="Kilometres per hour from the speed endpoint. Null cameras are omitted." query={speed}>
          <SpeedBars data={speed.data?.average_speed_kmh} />
        </ChartCard>
        <ChartCard title="Average speed by segment" description="Speed between consecutive cameras." query={speedSegments}>
          {null}
        </ChartCard>
        <ChartCard title="Average speed over time" description="Speed trend for the selected range." query={speedTime}>
          {null}
        </ChartCard>
        <ChartCard title="Origin to destination flows" description="Camera pair counts. Axes are Origin and Destination." query={od}>
          <OdMatrix matrix={od.data?.matrix} cameras={cameras.data ?? []} />
        </ChartCard>
        <ChartCard title="Congestion hotspot" description="Cameras ranked by the congestion score from the API." query={congestion}>
          <CongestionView hotspots={congestion.data?.hotspots ?? []} camera={topCamera ?? null} />
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      {value == null ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl tracking-tight">{value}</p>}
      <p className="text-xs text-room-muted">{label}</p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  query,
  children,
}: {
  title: string;
  description: string;
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: unknown };
  children: ReactNode;
}) {
  const missing = endpointLabel(query.error);
  return (
    <Panel title={title}>
      <p className="mb-3 text-xs text-white/50">{description}</p>
      {query.isLoading ? <Skeleton className="h-48" /> : null}
      {!query.isLoading && missing ? <EndpointMissing name={missing} /> : null}
      {!query.isLoading && query.isError && !missing ? <EmptyState title="Could not load this chart" /> : null}
      {!query.isLoading && !query.isError ? children : null}
    </Panel>
  );
}

function DensityBars({ data }: { data?: Record<string, Record<string, number>> }) {
  const rows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data).map(([camera, buckets]) => ({
      camera,
      count: Object.values(buckets).reduce((sum, value) => sum + value, 0),
    }));
  }, [data]);
  if (!rows.length) return <EmptyState title="No data yet" />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="camera" stroke="#8e8e8e" />
          <YAxis stroke="#8e8e8e" />
          <Tooltip />
          <Bar dataKey="count" fill="#ffffff" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DensityArea({ data }: { data?: Record<string, Record<string, number>> }) {
  const rows = useMemo(() => rowsOverTime(data), [data]);
  const keys = data ? Object.keys(data) : [];
  if (!rows.length) return <EmptyState title="No data yet" />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="time" stroke="#8e8e8e" hide />
          <YAxis stroke="#8e8e8e" />
          <Tooltip />
          {keys.map((key, index) => (
            <Area key={key} type="monotone" dataKey={key} stackId="1" stroke="#fff" fill={index % 2 ? "#f0b4c8" : "#9ecbff"} fillOpacity={0.35} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpeedBars({ data }: { data?: Record<string, number | null> }) {
  const rows = Object.entries(data ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([camera, kmh]) => ({ camera, kmh }));
  if (!rows.length) return <EmptyState title="No data yet" />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="camera" stroke="#8e8e8e" />
          <YAxis stroke="#8e8e8e" unit=" km/h" />
          <Tooltip />
          <Bar dataKey="kmh" fill="#f0b4c8" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OdMatrix({
  matrix,
  cameras,
}: {
  matrix?: Record<string, Record<string, number>>;
  cameras: Camera[];
}) {
  const ids = cameras.map((camera) => camera.camera_id);
  const hasFlow = matrix && Object.keys(matrix).length > 0;
  if (!hasFlow) return <EmptyState title="No data yet" />;
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-center text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left text-white/50">Origin \ Destination</th>
            {ids.map((id) => (
              <th key={id} className="p-1 font-mono">{id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((origin) => (
            <tr key={origin}>
              <th className="p-1 text-left font-mono">{origin}</th>
              {ids.map((destination) => {
                const count = matrix?.[origin]?.[destination] ?? 0;
                const tone = count === 0 ? "bg-white/5" : "bg-white/20";
                return (
                  <td key={destination} className={`p-2 font-mono ${tone}`}>
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CongestionView({
  hotspots,
  camera,
}: {
  hotspots: { camera_id: string; count: number; score: number; severity: string }[];
  camera: Camera | null;
}) {
  if (!hotspots.length) return <EmptyState title="No data yet" />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ol className="space-y-2 text-sm">
        {hotspots.map((spot, index) => (
          <li key={spot.camera_id} className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-2">
            <span>{index + 1}. {spot.camera_id}</span>
            <span className="font-mono text-xs">{spot.score} · {spot.severity} · {spot.count}</span>
          </li>
        ))}
      </ol>
      <HotspotMap camera={camera} />
    </div>
  );
}

function HotspotMap({ camera }: { camera: Camera | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current || !camera) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: CONFIG.mapStyle,
      center: [camera.lon, camera.lat],
      zoom: 13,
      interactive: false,
      attributionControl: false,
    });
    const el = document.createElement("div");
    el.textContent = camera.camera_id;
    el.style.cssText = "background:#fff;color:#111;border-radius:999px;padding:2px 6px;font-size:12px;";
    const marker = new maplibregl.Marker({ element: el }).setLngLat([camera.lon, camera.lat]).addTo(map);
    return () => {
      marker.remove();
      map.remove();
    };
  }, [camera]);
  if (!camera) return <EmptyState title="No data yet" />;
  return <div ref={ref} className="h-48 overflow-hidden rounded-xl" />;
}

function rowsOverTime(data?: Record<string, Record<string, number>>) {
  if (!data) return [];
  const times = new Set<string>();
  Object.values(data).forEach((buckets) => Object.keys(buckets).forEach((time) => times.add(time)));
  return [...times].sort().map((time) => {
    const row: Record<string, string | number> = { time: formatIst(time) };
    Object.entries(data).forEach(([camera, buckets]) => {
      row[camera] = buckets[time] ?? 0;
    });
    return row;
  });
}

function avg(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
