import type { Event } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { formatIst, formatPct } from "../../lib/format";
import { normalizePlate } from "../../lib/plates";

export function OcrPanel({ cameraId, cameraName, events }: { cameraId: string; cameraName: string; events: Event[] }) {
  const rows = events
    .filter((event) => event.camera_id === cameraId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = rows[0];
  return (
    <Panel title={`Camera OCR · ${cameraId}`}>
      <p className="mb-2 text-xs text-white/60">{cameraName}</p>
      {!latest ? <EmptyState title="No frames received for this camera yet" /> : null}
      {latest ? (
        <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr]">
          <div className="overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-white/50">
                <tr>
                  <th className="py-1 pr-2">Frame</th>
                  <th className="py-1 pr-2">Read</th>
                  <th className="py-1">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {latest.raw_reads.length ? (
                  latest.raw_reads.map((read) => {
                    const disagreed = normalizePlate(read.text) !== normalizePlate(latest.plate_text);
                    return (
                      <tr key={`${latest.event_id}-${read.frame_idx}-${read.text}`} className={disagreed ? "bg-amber-200/10" : ""}>
                        <td className="py-1 pr-2 font-mono">{read.frame_idx}</td>
                        <td className="py-1 pr-2 font-mono">
                          {read.text || "blank"}
                          {disagreed ? <span className="ml-2 text-amber-100">disagreed</span> : null}
                        </td>
                        <td className="py-1 font-mono">{formatPct(read.conf)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="py-2 text-white/50">No frames received for this camera yet</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-1 font-mono text-[11px] text-white/40">{formatIst(latest.timestamp)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50">Voted plate</p>
            <p className="font-mono text-2xl">{latest.plate_text}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-white" style={{ width: `${Math.round(latest.plate_confidence * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/60">{formatPct(latest.plate_confidence)} confidence</p>
            <div className="mt-2">
              <SourceTag source={latest.source} />
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
