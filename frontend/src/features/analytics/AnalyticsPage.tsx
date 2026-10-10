import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDensity, getSpeed } from "../../api/analytics";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import { FALLBACK_CAMERAS } from "../../config/cameras";

interface IntelReport {
  id: string;
  title: string;
  code: string;
  classification: "TOP SECRET" | "SECRET" | "CONFIDENTIAL";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "VERIFIED" | "PENDING" | "INVESTIGATING";
  summary: string;
  tags: string[];
  region: string;
  source: string;
  date: string;
}

const SEED_REPORTS: IntelReport[] = [
  {
    id: "rep-1",
    title: "CORRIDOR CONGESTION & BOTTLENECK ANALYSIS",
    code: "INT-2026-001",
    classification: "TOP SECRET",
    severity: "HIGH",
    status: "VERIFIED",
    summary:
      "Telemetry indicates severe vehicle clustering at Cyber Towers and Mindspace junctions during evening peak. Average corridor speed drops to 18 km/h.",
    tags: ["congestion", "bottleneck", "telemetry"],
    region: "Cyber Towers / Madhapur",
    source: "ANPR-M3",
    date: "2026-10-10",
  },
  {
    id: "rep-2",
    title: "IMPOSSIBLE TRAVEL & CLONED PLATE FORENSICS",
    code: "INT-2026-002",
    classification: "SECRET",
    severity: "CRITICAL",
    status: "PENDING",
    summary:
      "Temporal-spatial anomaly detected: vehicle plate TS09EG6531 observed at CAM01 and CAM05 within 12 seconds, exceeding maximum corridor velocity by 340 km/h.",
    tags: ["cloned_plate", "security", "anomaly"],
    region: "Financial District",
    source: "WATCHDOG-M4",
    date: "2026-10-10",
  },
  {
    id: "rep-3",
    title: "ORIGIN-DESTINATION ARTERIAL MIGRATION CORRIDOR",
    code: "INT-2026-003",
    classification: "CONFIDENTIAL",
    severity: "MEDIUM",
    status: "VERIFIED",
    summary:
      "Updated traffic migration matrix between Gachibowli Ring Road and Hitech City IT corridor indicates 72% west-to-east commuter trajectory.",
    tags: ["traffic_flow", "corridor", "migration"],
    region: "Hitech Corridor",
    source: "OSRM-SYNTH",
    date: "2026-10-09",
  },
  {
    id: "rep-4",
    title: "HIGH-SPEED ARTERIAL EVASION TELEMETRY",
    code: "INT-2026-004",
    classification: "SECRET",
    severity: "HIGH",
    status: "VERIFIED",
    summary:
      "Radar speed sensors clocked repeated sustained speeds exceeding 90 km/h between CAM03 and CAM04 during off-peak hours.",
    tags: ["speed_violation", "enforcement", "radar"],
    region: "Bio Diversity Flyover",
    source: "RADAR-M1",
    date: "2026-10-08",
  },
];

export function AnalyticsPage() {
  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<"reports" | "telemetry">("reports");

  const camerasQuery = useQuery({ queryKey: ["cameras"], queryFn: listCameras, retry: false });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: () => listEvents(), retry: false });
  const densityQuery = useQuery({
    queryKey: ["density"],
    queryFn: () => getDensity(new Date(Date.now() - 86400000).toISOString(), new Date().toISOString()),
    retry: false,
  });
  const speedQuery = useQuery({ queryKey: ["speed"], queryFn: getSpeed, retry: false });

  const cameras = camerasQuery.data ?? FALLBACK_CAMERAS;
  const events = eventsQuery.data ?? [];

  const filteredReports = SEED_REPORTS.filter(
    (r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  // Prepare chart data from density query
  const densityData = cameras.map((c) => {
    const count = densityQuery.data?.by_camera?.[c.camera_id]
      ? Object.values(densityQuery.data.by_camera[c.camera_id]).reduce((a, b) => a + b, 0)
      : events.filter((e) => e.camera_id === c.camera_id).length;
    return { name: c.camera_id, count, fullname: c.name };
  });

  const speedData = cameras.map((c) => {
    const spd = speedQuery.data?.average_speed_kmh?.[c.camera_id] ?? 42;
    return { name: c.camera_id, speed: Math.round(spd) };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header matching Screenshot 4 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold uppercase tracking-[0.12em] text-tac-text">
            Intelligence Center
          </h1>
          <p className="text-[11px] text-tac-text-dim uppercase tracking-wider mt-0.5">
            Classified reports and threat analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedTab(selectedTab === "reports" ? "telemetry" : "reports")}
            className="tac-btn font-bold py-2.5 px-5"
          >
            {selectedTab === "reports" ? "View Telemetry Charts" : "View Classified Reports"}
          </button>
          <button className="tac-btn font-bold py-2.5 px-5 bg-orange-600 hover:bg-orange-500">
            &#x25BD; Filter
          </button>
        </div>
      </div>

      {/* KPI Cards matching Screenshot 4 */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* Search */}
        <div className="w-full md:w-80">
          <div className="relative h-full flex items-center">
            <span className="absolute left-3.5 text-tac-text-dim text-[13px]">&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search intelligence reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-14 bg-tac-surface border border-tac-border px-10 text-[12px] text-tac-text placeholder:text-tac-text-muted focus:outline-none focus:border-tac-accent"
            />
          </div>
        </div>

        {/* 3 KPI Cards */}
        <div className="grid grid-cols-3 gap-4 flex-1">
          <div className="tac-stat-card">
            <div>
              <div className="tac-stat-label">Total Reports</div>
              <div className="tac-stat-value">1,247</div>
            </div>
            <div className="text-tac-text-dim text-xl">&#x1F4D6;</div>
          </div>
          <div className="tac-stat-card">
            <div>
              <div className="tac-stat-label">Critical Threats</div>
              <div className="tac-stat-value text-tac-red">12</div>
            </div>
            <div className="text-tac-red text-xl">&#x26A0;</div>
          </div>
          <div className="tac-stat-card">
            <div>
              <div className="tac-stat-label">Active Sources</div>
              <div className="tac-stat-value text-tac-accent">89</div>
            </div>
            <div className="text-tac-accent text-xl">&#x1F310;</div>
          </div>
        </div>
      </div>

      {selectedTab === "reports" ? (
        /* Intelligence Reports List matching Screenshot 4 */
        <div className="space-y-4">
          <div className="text-[12px] uppercase font-bold tracking-[0.15em] text-tac-text-dim">
            Intelligence Reports
          </div>
          <div className="space-y-3">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="tac-card rounded-md p-5 hover:border-tac-accent/50 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left content */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg text-tac-text-dim shrink-0">
                      &#x1F4C4;
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-[13px] uppercase tracking-wider text-tac-text">
                          {report.title}
                        </h3>
                        <span className="text-[10px] font-mono text-tac-text-muted">
                          {report.code}
                        </span>
                      </div>
                      <p className="text-[11px] text-tac-text-dim leading-relaxed max-w-3xl">
                        {report.summary}
                      </p>
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {report.tags.map((tag) => (
                          <span
                            key={tag}
                            className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[9px] px-2 py-0.5 rounded font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right metadata and badges */}
                  <div className="flex flex-col md:items-end justify-between shrink-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-red-950/60 text-red-400 border border-red-700/60">
                        {report.classification}
                      </span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-amber-950/60 text-amber-400 border border-amber-700/60">
                        {report.severity}
                      </span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {report.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-tac-text-muted text-right space-y-0.5 font-mono">
                      <div>&#x1F310; {report.region}</div>
                      <div>&#x25C9; {report.source}</div>
                      <div>{report.date}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Telemetry Visualizations */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="tac-card rounded-md p-5">
            <div className="tac-card-title">Corridor Traffic Density by Camera</div>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={densityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="name" stroke="#666" fontSize={11} fontFamily="monospace" />
                  <YAxis stroke="#666" fontSize={11} fontFamily="monospace" />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "11px", fontFamily: "monospace" }}
                  />
                  <Bar dataKey="count" fill="#ff6a00" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="tac-card rounded-md p-5">
            <div className="tac-card-title">Average Corridor Velocity (km/h)</div>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={speedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="name" stroke="#666" fontSize={11} fontFamily="monospace" />
                  <YAxis stroke="#666" fontSize={11} fontFamily="monospace" />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "11px", fontFamily: "monospace" }}
                  />
                  <Bar dataKey="speed" fill="#ffaa00" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
