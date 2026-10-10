import { useState } from "react";
import type { Camera, Event } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatIst, formatPct } from "../../lib/format";
import { normalizePlate } from "../../lib/plates";

export function OcrPanel({
  cameraId,
  cameraName,
  events,
  cameras,
  onSelectCamera,
  onClose,
}: {
  cameraId: string;
  cameraName: string;
  events: Event[];
  cameras?: Camera[];
  onSelectCamera?: (id: string) => void;
  onClose?: () => void;
}) {
  const [videoError, setVideoError] = useState(false);
  const [showRawReads, setShowRawReads] = useState(true);

  const rows = events
    .filter((event) => event.camera_id === cameraId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = rows[0];

  return (
    <div className="tac-card rounded-lg p-3 bg-tac-surface/95 backdrop-blur-md border border-tac-border shadow-2xl flex flex-col space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-tac-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-tac-accent animate-pulse" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-tac-text">
            Plate Recognition: {cameraId}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-tac-text-dim truncate max-w-[120px] font-mono">
            {cameraName}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-tac-text-dim hover:text-tac-accent text-xs px-1 py-0.5 rounded transition-colors"
              title="Close Panel"
            >
              &#x2715;
            </button>
          )}
        </div>
      </div>

      {/* Camera switcher pills */}
      {cameras && cameras.length > 0 && onSelectCamera && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {cameras.map((cam) => {
            const isSelected = cam.camera_id === cameraId;
            return (
              <button
                key={cam.camera_id}
                onClick={() => onSelectCamera(cam.camera_id)}
                className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded transition-colors ${
                  isSelected
                    ? "bg-tac-accent text-black font-extrabold shadow-sm"
                    : "bg-tac-inner text-tac-text-dim hover:text-white border border-tac-border"
                }`}
              >
                {cam.camera_id}
              </button>
            );
          })}
        </div>
      )}

      {/* Camera Feed Media */}
      <div className="rounded border border-tac-border bg-black relative flex items-center justify-center overflow-hidden aspect-video max-h-44">
        {cameraId === "CAM01" && !videoError ? (
          <video
            src="/videos/CAM01.mp4"
            controls
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            onError={() => setVideoError(true)}
          />
        ) : (
          <img
            src={`/stills/${cameraId}.png`}
            alt={`${cameraName} feed`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/stills/CAM01.png";
            }}
          />
        )}
        <div className="absolute top-1.5 left-1.5 bg-black/85 border border-tac-border px-1.5 py-0.5 rounded text-[8px] font-mono text-tac-accent uppercase tracking-wider">
          LIVE FEED: {cameraId}
        </div>
        <div className="absolute bottom-1.5 right-1.5 bg-black/75 px-1.5 py-0.5 rounded text-[8px] font-mono text-tac-text-dim">
          1080p 30fps
        </div>
      </div>

      {/* Voted Plate & Confidence Result */}
      <div className="bg-tac-inner border border-tac-border p-2.5 rounded">
        {latest ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-tac-text-muted font-bold">
                Voted Plate Output
              </span>
              <SourceTag source={latest.source} />
            </div>

            <div className="flex items-center justify-between mt-1">
              <p className="font-mono text-lg font-bold text-tac-accent tracking-wider drop-shadow-sm">
                {latest.plate_text}
              </p>
              <span className="text-[10px] font-mono font-bold text-white bg-tac-surface px-1.5 py-0.5 rounded border border-tac-border">
                {formatPct(latest.plate_confidence)}
              </span>
            </div>

            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-tac-accent transition-all duration-300"
                style={{ width: `${Math.round(latest.plate_confidence * 100)}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[9px] text-tac-text-dim mt-1.5 font-mono">
              <span>{formatIst(latest.timestamp)}</span>
              <span>{latest.vehicle_color || "Vehicle"} {latest.vehicle_type || "Car"}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-2 text-[10px] text-tac-text-muted font-mono">
            Waiting for ANPR read at {cameraId}...
          </div>
        )}
      </div>

      {/* Raw Frame OCR Reads (Collapsible) */}
      <div className="border border-tac-border/80 rounded bg-tac-inner/60 overflow-hidden">
        <button
          onClick={() => setShowRawReads((prev) => !prev)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-[9px] uppercase font-bold text-tac-text-dim hover:text-white transition-colors bg-tac-inner"
        >
          <span>Raw OCR Frame Votes ({latest?.raw_reads.length ?? 0})</span>
          <span>{showRawReads ? "▾" : "▸"}</span>
        </button>

        {showRawReads && (
          <div className="max-h-28 overflow-y-auto p-1.5">
            {!latest || !latest.raw_reads.length ? (
              <EmptyState title="No raw frames" detail="Frame reads will log here as video streams." />
            ) : (
              <table className="w-full text-left text-[10px] font-mono">
                <thead className="text-[8px] uppercase text-tac-text-muted border-b border-tac-border">
                  <tr>
                    <th className="pb-1">Frame</th>
                    <th className="pb-1">Read</th>
                    <th className="pb-1 text-right">Conf</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tac-border/30">
                  {latest.raw_reads.map((read) => {
                    const disagreed = normalizePlate(read.text) !== normalizePlate(latest.plate_text);
                    return (
                      <tr
                        key={`${latest.event_id}-${read.frame_idx}-${read.text}`}
                        className={disagreed ? "bg-amber-950/20 text-amber-300" : "text-tac-text"}
                      >
                        <td className="py-0.5 text-tac-text-muted">#{read.frame_idx}</td>
                        <td className="py-0.5 font-bold">
                          {read.text || "blank"}
                          {disagreed && (
                            <span className="ml-1 text-[7px] text-tac-accent uppercase border border-tac-accent/40 px-0.5 rounded">
                              diff
                            </span>
                          )}
                        </td>
                        <td className="py-0.5 text-right text-tac-text-dim">{formatPct(read.conf)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
