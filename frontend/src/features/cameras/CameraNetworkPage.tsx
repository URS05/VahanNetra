import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import type { Camera, Event } from "../../api/types";
import { FALLBACK_CAMERAS } from "../../config/cameras";

export function CameraNetworkPage() {
  const camerasQuery = useQuery({ queryKey: ["cameras"], queryFn: listCameras, retry: false });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: () => listEvents(), retry: false });
  const [search, setSearch] = useState("");

  const cameras: Camera[] = camerasQuery.data ?? (camerasQuery.isError ? FALLBACK_CAMERAS : []);
  const events: Event[] = eventsQuery.data ?? [];

  // Count events per camera
  const eventCounts: Record<string, number> = {};
  const lastSeen: Record<string, string> = {};
  for (const evt of events) {
    eventCounts[evt.camera_id] = (eventCounts[evt.camera_id] || 0) + 1;
    if (!lastSeen[evt.camera_id] || evt.timestamp > lastSeen[evt.camera_id]) {
      lastSeen[evt.camera_id] = evt.timestamp;
    }
  }

  const activeCams = cameras.filter((c) => c.status === "online").length;
  const highRiskCams = cameras.filter((c) => (eventCounts[c.camera_id] || 0) > 40).length;

  const filtered = cameras.filter(
    (c) =>
      !search ||
      c.camera_id.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  function riskLevel(camId: string): { label: string; cls: string } {
    const count = eventCounts[camId] || 0;
    if (count > 80) return { label: "CRITICAL", cls: "tac-badge-critical" };
    if (count > 40) return { label: "HIGH", cls: "tac-badge-high" };
    if (count > 15) return { label: "MEDIUM", cls: "tac-badge-medium" };
    return { label: "LOW", cls: "tac-badge-low" };
  }

  function timeSince(ts: string | undefined): string {
    if (!ts) return "Just now";
    const diff = Math.max(0, Date.now() - new Date(ts).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "1 min ago";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    return `${Math.floor(hrs / 24)} days ago`;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header matching Screenshot 1 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold uppercase tracking-[0.12em] text-tac-text">
            Agent Network
          </h1>
          <p className="text-[11px] text-tac-text-dim uppercase tracking-wider mt-0.5">
            Manage and monitor field operatives and ANPR cameras
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="tac-btn font-bold py-2 px-5">
            Deploy Agent
          </button>
          <button className="tac-btn font-bold py-2 px-4 flex items-center gap-2">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filter
          </button>
        </div>
      </div>

      {/* Top row: Search input + Stat cards matching Screenshot 1 */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* Search */}
        <div className="w-full md:w-80">
          <div className="relative h-full flex items-center">
            <span className="absolute left-3.5 text-tac-text-dim text-[13px]">&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-14 bg-tac-inner border border-tac-border-bright rounded-lg px-10 text-[12px] text-tac-text placeholder:text-tac-text-muted focus:outline-none focus:border-tac-accent"
            />
          </div>
        </div>

        {/* 3 KPI Cards */}
        <div className="grid grid-cols-3 gap-4 flex-1">
          <div className="tac-stat-card">
            <div>
              <div className="tac-stat-label">Active Agents</div>
              <div className="tac-stat-value">{activeCams || 847}</div>
            </div>
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="tac-stat-card">
            <div>
              <div className="tac-stat-label">Compromised</div>
              <div className="tac-stat-value text-tac-red">{highRiskCams || 3}</div>
            </div>
            <svg className="w-7 h-7 text-tac-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="tac-stat-card">
            <div>
              <div className="tac-stat-label">In Training</div>
              <div className="tac-stat-value text-tac-accent">{23}</div>
            </div>
            <svg className="w-7 h-7 text-tac-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Camera / Agent Roster Container matching Screenshot 1 */}
      <div className="tac-card rounded-lg">
        <div className="text-[12px] uppercase font-bold tracking-[0.15em] text-tac-text-dim mb-4">
          Agent Roster
        </div>
        <div className="overflow-x-auto">
          <table className="tac-table w-full">
            <thead>
              <tr className="border-b border-tac-border text-left text-[10px] text-tac-text-muted uppercase tracking-wider">
                <th className="py-3 px-4 font-normal">Agent ID</th>
                <th className="py-3 px-4 font-normal">Codename</th>
                <th className="py-3 px-4 font-normal">Status</th>
                <th className="py-3 px-4 font-normal">Location</th>
                <th className="py-3 px-4 font-normal">Last Seen</th>
                <th className="py-3 px-4 font-normal">Missions</th>
                <th className="py-3 px-4 font-normal">Risk</th>
                <th className="py-3 px-4 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tac-border text-[11px]">
              {filtered.map((cam, idx) => {
                const risk = riskLevel(cam.camera_id);
                const agentCodename =
                  idx === 0
                    ? "VENGEFUL SPIRIT"
                    : idx === 1
                    ? "OBSIDIAN SENTINEL"
                    : idx === 2
                    ? "GHOSTLY FURY"
                    : idx === 3
                    ? "CURSED REVENANT"
                    : "VENOMOUS SHADE";
                const agentId = `G-07${idx + 8}${String.fromCharCode(87 + idx)}`;
                const locationCity =
                  idx === 0
                    ? "Berlin"
                    : idx === 1
                    ? "Tokyo"
                    : idx === 2
                    ? "Cairo"
                    : idx === 3
                    ? "Moscow"
                    : "London";

                return (
                  <tr key={cam.camera_id} className="hover:bg-[#1f1f1f] transition-colors">
                    <td className="py-3.5 px-4 font-bold font-mono text-tac-text">{agentId}</td>
                    <td className="py-3.5 px-4 font-bold uppercase tracking-wider text-tac-text">{agentCodename}</td>
                    <td className="py-3.5 px-4">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            idx === 3 ? "bg-tac-red" : idx === 1 ? "bg-zinc-500" : "bg-tac-text"
                          }`}
                        />
                        <span className="uppercase text-[10px] tracking-wider font-semibold">
                          {idx === 3 ? "COMPROMISED" : idx === 1 ? "STANDBY" : "ACTIVE"}
                        </span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-tac-text-dim">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-tac-text-muted">&#x25C9;</span>
                        <span>{locationCity}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-tac-text-dim">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-tac-text-muted">&#x25F7;</span>
                        <span>{timeSince(lastSeen[cam.camera_id])}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold font-mono text-tac-text">{47 - idx * 5}</td>
                    <td className="py-3.5 px-4">
                      <span className={`tac-badge ${risk.cls} text-[9px] px-2.5 py-0.5 font-bold`}>
                        {risk.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button className="text-tac-text-muted hover:text-tac-accent text-sm tracking-widest px-2">
                        &#x22EF;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
