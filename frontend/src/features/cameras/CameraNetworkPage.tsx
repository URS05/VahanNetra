import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import type { Camera, Event } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { FALLBACK_CAMERAS } from "../../config/cameras";
import { formatIst, formatPct } from "../../lib/format";
import { normalizePlate } from "../../lib/plates";

/** Time-synced plate data for CAM01 video */
const VIDEO_PLATES = [
  { time: 9, plate: "TS09EG6531", speed: 40 },
  { time: 17, plate: "AP28AS1318", speed: 38 },
  { time: 22, plate: "HR38V6965", speed: 42 },
  { time: 53, plate: "AP21AX369", speed: 39 },
];

export function CameraNetworkPage() {
  const camerasQuery = useQuery({ queryKey: ["cameras"], queryFn: listCameras, retry: false });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: () => listEvents(), retry: false });

  const [activeCamId, setActiveCamId] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [videoError, setVideoError] = useState(false);
  const [currentVideoPlate, setCurrentVideoPlate] = useState<{ plate: string; speed: number } | null>(null);

  const cameras: Camera[] = camerasQuery.data ?? (camerasQuery.isError ? FALLBACK_CAMERAS : []);
  const events: Event[] = eventsQuery.data ?? [];

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const t = e.currentTarget.currentTime;
    const match = VIDEO_PLATES.find((p) => Math.abs(p.time - t) <= 1.2);
    setCurrentVideoPlate(match ? { plate: match.plate, speed: match.speed } : null);
  };

  const filteredCameras = cameras.filter((c) => {
    if (activeCamId !== "ALL" && c.camera_id !== activeCamId) return false;
    if (
      search &&
      !c.camera_id.toLowerCase().includes(search.toLowerCase()) &&
      !c.name.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold uppercase tracking-[0.14em] text-tac-text">
            Camera Feeds
          </h1>
          <p className="text-[11px] text-tac-text-dim uppercase tracking-wider mt-0.5">
            Real-time video &amp; ANPR frame telemetry across Hyderabad corridor
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/live" className="tac-btn font-bold py-2 px-4 flex items-center gap-2">
            <span>&#x25CE;</span> View On Map
          </Link>
        </div>
      </div>

      {/* Camera Switcher Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center bg-tac-surface border border-tac-border p-1 rounded-lg">
          <button
            onClick={() => setActiveCamId("ALL")}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
              activeCamId === "ALL"
                ? "bg-tac-accent text-white"
                : "text-tac-text-dim hover:text-white"
            }`}
          >
            All Cameras (5)
          </button>
          {cameras.map((c) => (
            <button
              key={c.camera_id}
              onClick={() => setActiveCamId(c.camera_id)}
              className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
                activeCamId === c.camera_id
                  ? "bg-tac-accent text-white"
                  : "text-tac-text-dim hover:text-white"
              }`}
            >
              {c.camera_id}
            </button>
          ))}
        </div>

        <div className="tac-search w-full md:w-64">
          <span className="tac-search-icon">&#x1F50D;</span>
          <input
            type="text"
            placeholder="Search cameras or plates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Feeds Grid */}
      <div className="space-y-6">
        {filteredCameras.map((camera) => {
          const camEvents = events
            .filter((e) => e.camera_id === camera.camera_id)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          const latestEvent = camEvents[0];

          return (
            <div
              key={camera.camera_id}
              className="tac-card rounded-lg p-5 bg-tac-surface border border-tac-border shadow-lg"
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-tac-border mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-tac-accent animate-pulse" />
                  <span className="font-mono text-sm font-bold text-tac-text">
                    {camera.camera_id}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-tac-text-dim">
                    {camera.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-tac-text-muted">
                  <span>GPS: {camera.lat.toFixed(4)}, {camera.lon.toFixed(4)}</span>
                  <span className="text-tac-green font-bold">&#x25C9; ONLINE</span>
                </div>
              </div>

              {/* Feed Grid: Media + Frame Reads + Voted Plate */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Media Column (5 cols) */}
                <div className="lg:col-span-5 relative rounded-lg overflow-hidden border border-tac-border bg-black flex items-center justify-center min-h-[220px]">
                  {camera.camera_id === "CAM01" && !videoError ? (
                    <div className="relative w-full h-full">
                      <video
                        src="/videos/CAM01.mp4"
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full h-full max-h-72 object-cover"
                        onTimeUpdate={handleTimeUpdate}
                        onError={() => setVideoError(true)}
                      />
                      {currentVideoPlate && (
                        <div className="absolute top-3 left-3 bg-black/85 border border-tac-accent px-3 py-1.5 rounded text-[11px] font-mono text-tac-accent font-bold">
                          <div>DETECTED: {currentVideoPlate.plate}</div>
                          <div className="text-[10px] text-white">
                            SPEED: {currentVideoPlate.speed} km/h
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative w-full h-full">
                      <img
                        src={`/stills/${camera.camera_id}.png`}
                        alt={`${camera.name} still`}
                        className="w-full h-full max-h-72 object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/stills/CAM01.png";
                        }}
                      />
                      <div className="absolute bottom-2 left-2 bg-black/80 border border-tac-border px-2 py-0.5 rounded text-[9px] font-mono text-tac-accent">
                        FEED CAPTURE · {camera.camera_id}
                      </div>
                    </div>
                  )}
                </div>

                {/* Raw OCR Frames Table (4 cols) */}
                <div className="lg:col-span-4 bg-tac-inner border border-tac-border rounded-lg p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-tac-text-muted mb-2 tracking-wider flex items-center justify-between">
                      <span>Raw OCR Frame Telemetry</span>
                      <span>Confidence</span>
                    </div>
                    {latestEvent?.raw_reads.length ? (
                      <div className="overflow-auto max-h-52">
                        <table className="w-full text-left text-[11px] font-mono">
                          <tbody className="divide-y divide-tac-border/40">
                            {latestEvent.raw_reads.map((read) => {
                              const disagreed =
                                normalizePlate(read.text) !== normalizePlate(latestEvent.plate_text);
                              return (
                                <tr
                                  key={`${read.frame_idx}-${read.text}`}
                                  className={
                                    disagreed
                                      ? "bg-amber-950/20 text-amber-300"
                                      : "text-tac-text hover:bg-black/40"
                                  }
                                >
                                  <td className="py-1 text-tac-text-muted">F#{read.frame_idx}</td>
                                  <td className="py-1 font-bold">
                                    {read.text || "blank"}
                                    {disagreed && (
                                      <span className="ml-1 text-[8px] text-tac-accent uppercase border border-tac-accent/40 px-1 rounded">
                                        diff
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1 text-right text-tac-text-dim">
                                    {formatPct(read.conf)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-10 text-center text-xs text-tac-text-muted font-mono">
                        No raw frames logged for this camera yet
                      </div>
                    )}
                  </div>
                  {latestEvent && (
                    <div className="pt-2 border-t border-tac-border text-[9px] text-tac-text-muted font-mono">
                      Timestamp: {formatIst(latestEvent.timestamp)}
                    </div>
                  )}
                </div>

                {/* Voted Plate & Classification (3 cols) */}
                <div className="lg:col-span-3 bg-tac-inner border border-tac-border rounded-lg p-4 flex flex-col justify-between">
                  {latestEvent ? (
                    <>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-tac-text-muted font-bold">
                          Voted ANPR Plate
                        </span>
                        <div className="mt-1 font-mono text-2xl font-bold text-tac-accent tracking-wider">
                          {latestEvent.plate_text}
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between items-center text-[10px] text-tac-text-dim font-mono mb-1">
                            <span>Vote Confidence:</span>
                            <span className="font-bold text-white">
                              {formatPct(latestEvent.plate_confidence)}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full bg-tac-accent transition-all duration-300"
                              style={{
                                width: `${Math.round(latestEvent.plate_confidence * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-tac-border space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-tac-text-muted">Source Tier:</span>
                          <SourceTag source={latestEvent.source} />
                        </div>
                        <Link
                          to={`/live`}
                          className="tac-btn w-full justify-center py-1.5 text-[10px] font-bold mt-2"
                        >
                          Trace Vehicle On Map
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-xs text-tac-text-muted font-mono">
                      Awaiting detection events
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
