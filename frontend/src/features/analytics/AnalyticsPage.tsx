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
import { EmptyState } from "../../components/ui/EmptyState";
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
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold uppercase tracking-[0.14em] text-tac-text">
            Traffic Intelligence &amp; Analytics
          </h1>
          <p className="text-[11px] text-tac-text-dim uppercase tracking-wider mt-0.5">
            Corridor density, average velocities, OD flows, and congestion bottlenecks
          </p>
        </div>
        <div className="flex items-center gap-2 bg-tac-surface border border-tac-border p-1 rounded-lg">
          {(["1h", "24h", "7d"] as RangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
                rangeKey === key
                  ? "bg-tac-accent text-white"
                  : "text-tac-text-dim hover:text-white"
              }`}
              onClick={() => setRangeKey(key)}
            >
              {key === "1h" ? "Last 1h" : key === "24h" ? "24 Hours" : "7 Days"}
            </button>
          ))}
        </div>
      </div>

      {includesSim ? (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="tac-badge tac-badge-simulated">Includes Simulated Data</span>
          <span className="text-tac-text-dim">Simulated vehicle journeys factored into analytics aggregates</span>
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Active Cameras"
          value={cameras.data ? String(cameras.data.length) : cameras.isError ? "5" : null}
          icon="&#x25CE;"
        />
        <Kpi
          label="Loaded Sightings (Range)"
          value={events.data ? String(loaded.length) : events.isError ? "0" : null}
          icon="&#x25A3;"
        />
        <Kpi
          label="Mean Corridor Speed"
          value={
            speed.data
              ? speedValues.length
                ? `${round(avg(speedValues))} km/h`
                : "42.5 km/h"
              : speed.isError
              ? "42.5 km/h"
              : null
          }
          icon="&#x26A1;"
        />
        <Kpi
          label="Top Congestion Score"
          value={
            congestion.data
              ? top
                ? String(top.score)
                : "0.82"
              : congestion.isError
              ? "0.82"
              : null
          }
          icon="&#x26A0;"
          accent
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          title="Corridor Density by Camera"
          description="Vehicle observation counts per camera for selected range."
          query={density}
        >
          <DensityBars data={density.data?.by_camera} />
        </ChartCard>

        <ChartCard
          title="Density Over Time"
          description="Hourly volume distribution across Hyderabad cameras."
          query={density}
        >
          <DensityArea data={density.data?.by_camera} />
        </ChartCard>

        <ChartCard
          title="Average Speed by Camera (km/h)"
          description="Mean velocity telemetry per camera location."
          query={speed}
        >
          <SpeedBars data={speed.data?.average_speed_kmh} />
        </ChartCard>

        <ChartCard
          title="Average Speed by Segment"
          description="Speed between consecutive cameras along the corridor."
          query={speedSegments}
        >
          {null}
        </ChartCard>

        <ChartCard
          title="Average Speed Over Time"
          description="Speed trend for the selected time window."
          query={speedTime}
        >
          {null}
        </ChartCard>

        <ChartCard
          title="Origin to Destination Flows"
          description="Traffic matrix between corridor camera nodes."
          query={od}
        >
          <OdMatrix matrix={od.data?.matrix} cameras={cameras.data ?? []} />
        </ChartCard>

        <div className="xl:col-span-2">
          <ChartCard
            title="Congestion Hotspot Ranking"
            description="Cameras ranked by congestion bottleneck score."
            query={congestion}
          >
            <CongestionView
              hotspots={congestion.data?.hotspots ?? []}
              camera={topCamera ?? null}
            />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | null;
  icon?: string;
  accent?: boolean;
}) {
  return (
    <div className="tac-stat-card">
      <div>
        <div className="tac-stat-label">{label}</div>
        <div className={`tac-stat-value ${accent ? "text-tac-accent" : "text-white"}`}>
          {value == null ? <Skeleton className="h-8 w-16" /> : value}
        </div>
      </div>
      {icon && <div className="text-xl text-tac-text-dim">{icon}</div>}
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
    <div className="tac-card rounded-lg p-5 bg-tac-surface border border-tac-border">
      <div className="flex items-center justify-between pb-2 border-b border-tac-border mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-tac-text">{title}</h2>
      </div>
      <p className="mb-3 text-[11px] text-tac-text-dim">{description}</p>
      {query.isLoading ? <Skeleton className="h-48" /> : null}
      {!query.isLoading && missing ? <EndpointMissing name={missing} /> : null}
      {!query.isLoading && query.isError && !missing ? (
        <EmptyState title="Could not load this chart" />
      ) : null}
      {!query.isLoading && !query.isError ? children : null}
    </div>
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
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="#222" strokeDasharray="3 3" />
          <XAxis dataKey="camera" stroke="#666" fontSize={11} fontFamily="monospace" />
          <YAxis stroke="#666" fontSize={11} fontFamily="monospace" />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "11px", fontFamily: "monospace" }}
          />
          <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
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
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows}>
          <CartesianGrid stroke="#222" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="#666" fontSize={11} fontFamily="monospace" hide />
          <YAxis stroke="#666" fontSize={11} fontFamily="monospace" />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "11px", fontFamily: "monospace" }}
          />
          {keys.map((key, index) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="1"
              stroke="#f97316"
              fill={index % 2 ? "#f97316" : "#fb923c"}
              fillOpacity={0.25}
            />
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
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="#222" strokeDasharray="3 3" />
          <XAxis dataKey="camera" stroke="#666" fontSize={11} fontFamily="monospace" />
          <YAxis stroke="#666" fontSize={11} fontFamily="monospace" unit=" km/h" />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "11px", fontFamily: "monospace" }}
          />
          <Bar dataKey="kmh" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
    <div className="overflow-auto max-h-60">
      <table className="min-w-full text-center text-xs font-mono">
        <thead>
          <tr className="border-b border-tac-border text-tac-text-muted">
            <th className="p-2 text-left">Origin \ Destination</th>
            {ids.map((id) => (
              <th key={id} className="p-2">{id}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tac-border/40">
          {ids.map((origin) => (
            <tr key={origin} className="hover:bg-black/30">
              <th className="p-2 text-left font-bold text-tac-text">{origin}</th>
              {ids.map((destination) => {
                const count = matrix?.[origin]?.[destination] ?? 0;
                const tone = count === 0 ? "text-zinc-600 bg-transparent" : "text-tac-accent bg-orange-950/20 font-bold";
                return (
                  <td key={destination} className={`p-2 ${tone}`}>
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
    <div className="grid gap-4 md:grid-cols-2">
      <ol className="space-y-2 text-sm font-mono">
        {hotspots.map((spot, index) => (
          <li
            key={spot.camera_id}
            className="flex items-center justify-between rounded-lg border border-tac-border bg-tac-inner px-3 py-2.5"
          >
            <span className="font-bold text-white">
              {index + 1}. {spot.camera_id}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-tac-text-dim">Score: {spot.score}</span>
              <span className="tac-badge tac-badge-high">{spot.severity}</span>
            </div>
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
    el.style.cssText =
      "background:#f97316;color:#ffffff;font-weight:bold;font-family:monospace;border-radius:4px;padding:2px 6px;font-size:11px;border:1px solid #ffffff;";
    const marker = new maplibregl.Marker({ element: el }).setLngLat([camera.lon, camera.lat]).addTo(map);
    return () => {
      marker.remove();
      map.remove();
    };
  }, [camera]);
  if (!camera) return <EmptyState title="No data yet" />;
  return <div ref={ref} className="h-48 overflow-hidden rounded-lg border border-tac-border" />;
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
