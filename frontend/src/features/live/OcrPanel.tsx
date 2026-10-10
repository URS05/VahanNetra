import { useState } from "react";
import type { Event } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatIst, formatPct } from "../../lib/format";
import { normalizePlate } from "../../lib/plates";

export function OcrPanel({
  cameraId,
  cameraName,
  events,
  onClose,
}: {
  cameraId: string;
  cameraName: string;
  events: Event[];
  onClose?: () => void;
}) {
  const [videoError, setVideoError] = useState(false);
  const rows = events
    .filter((event) => event.camera_id === cameraId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = rows[0];

  return (
    <div className="tac-card rounded-lg p-4 bg-tac-surface border border-tac-border shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-tac-border mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-tac-accent animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-tac-text">
            Camera Feed &amp; OCR · {cameraId}
          </h2>
          <span className="text-[11px] text-tac-text-dim">({cameraName})</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-tac-text-dim hover:text-tac-accent text-sm px-1.5 py-0.5 rounded transition-colors"
          >
            &#x2715;
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Camera Feed Media */}
        <div className="rounded-lg overflow-hidden border border-tac-border bg-black relative flex items-center justify-center min-h-[180px]">
          {cameraId === "CAM01" && !videoError ? (
            <video
              src="/videos/CAM01.mp4"
              controls
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover max-h-56"
              onError={() => setVideoError(true)}
            />
          ) : (
            <img
              src={`/stills/${cameraId}.png`}
              alt={`${cameraName} feed`}
              className="w-full h-full object-cover max-h-56"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/stills/CAM01.png";
              }}
            />
          )}
          <div className="absolute top-2 left-2 bg-black/80 border border-tac-border px-2 py-0.5 rounded text-[9px] font-mono text-tac-accent uppercase">
            LIVE FEED · {cameraId}
          </div>
        </div>

        {/* Center: Raw Frame OCR Reads */}
        <div className="overflow-auto max-h-56 pr-1">
          <div className="text-[10px] uppercase font-bold text-tac-text-muted mb-1.5 tracking-wider">
            Raw OCR Frame Votes
          </div>
          {!latest ? (
            <EmptyState title="No frames received yet" />
          ) : (
            <table className="w-full text-left text-[11px] font-mono">
              <thead className="text-[10px] text-tac-text-muted border-b border-tac-border">
                <tr>
                  <th className="py-1">Frame</th>
                  <th className="py-1">Read</th>
                  <th className="py-1 text-right">Conf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tac-border/40">
                {latest.raw_reads.length ? (
                  latest.raw_reads.map((read) => {
                    const disagreed = normalizePlate(read.text) !== normalizePlate(latest.plate_text);
                    return (
                      <tr
                        key={`${latest.event_id}-${read.frame_idx}-${read.text}`}
                        className={disagreed ? "bg-amber-950/20 text-amber-300" : "text-tac-text"}
                      >
                        <td className="py-1 text-tac-text-muted">{read.frame_idx}</td>
                        <td className="py-1 font-bold">
                          {read.text || "blank"}
                          {disagreed && (
                            <span className="ml-1 text-[8px] text-tac-accent uppercase border border-tac-accent/40 px-1 rounded">
                              diff
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-right text-tac-text-dim">{formatPct(read.conf)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="py-2 text-tac-text-muted">
                      No raw frame reads recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Voted Plate & Confidence */}
        <div className="flex flex-col justify-between bg-tac-inner border border-tac-border p-3.5 rounded-lg">
          {latest ? (
            <>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-tac-text-muted font-bold">
                  Voted Plate Result
                </span>
                <p className="font-mono text-xl font-bold text-tac-accent mt-1 tracking-wider">
                  {latest.plate_text}
                </p>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-tac-accent transition-all duration-300"
                    style={{ width: `${Math.round(latest.plate_confidence * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-tac-text-dim mt-1.5 font-mono">
                  <span>Confidence:</span>
                  <span className="font-bold text-white">{formatPct(latest.plate_confidence)}</span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-tac-border flex items-center justify-between">
                <span className="text-[10px] font-mono text-tac-text-muted">
                  {formatIst(latest.timestamp)}
                </span>
                <SourceTag source={latest.source} />
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-xs text-tac-text-muted">
              Select a camera to inspect OCR telemetry
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
