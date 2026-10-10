import type { Camera, Sighting } from "../../api/types";
import { SimulatedSightingCard } from "../../components/SimulatedSightingCard";
import { SourceTag } from "../../components/SourceTag";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { cameraById } from "../../config/cameras";
import { formatIst, formatPct, formatRelative } from "../../lib/format";
import type { ResolvedSegment } from "../../map/roads";

export function TrajectoryPanel({
  plate,
  matchType,
  sightings,
  segments,
  cameras,
  loading,
  error,
  onClose,
}: {
  plate: string;
  matchType: string | null;
  sightings: Sighting[];
  segments: ResolvedSegment[];
  cameras: Camera[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const origin = sightings[0]?.timestamp;
  return (
    <Panel
      title="Trajectory"
      action={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <p className="font-mono text-lg">{plate}</p>
      <p className="text-xs text-white/50">{matchType ?? "No match type"}</p>
      {loading ? <p className="mt-2 text-xs text-white/50">Loading trajectory</p> : null}
      {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
      {!loading && !error && sightings.length === 0 ? <div className="mt-2"><EmptyState title="No data yet" /></div> : null}
      <ul className="mt-3 max-h-64 space-y-2 overflow-auto">
        {sightings.map((sighting) => (
          <li key={sighting.event_id} className="rounded-xl border border-white/10 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs">{formatIst(sighting.timestamp)}</p>
              <SourceTag source={sighting.source} />
            </div>
            <p className="text-xs text-white/60">{origin ? formatRelative(sighting.timestamp, origin) : ""}</p>
            <p className="text-sm">{sighting.camera_id} · {formatPct(sighting.plate_confidence)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        {sightings.map((sighting) => (
          <EvidenceCard key={sighting.event_id} sighting={sighting} cameras={cameras} />
        ))}
      </div>
      {segments.length ? (
        <ul className="mt-3 space-y-1 text-xs text-white/70">
          {segments.map((segment) => (
            <li key={`${segment.from}-${segment.to}`}>
              {segment.from} to {segment.to}: {segment.kind === "inferred" ? "inferred" : segment.kind}
              {segment.approximate ? ", approximate road route" : ""}
              {segment.unavailable ? ", road geometry unavailable" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

export function EvidenceCard({ sighting, cameras }: { sighting: Sighting; cameras: Camera[] }) {
  const camera = cameraById(cameras, sighting.camera_id);
  const name = camera ? `${camera.camera_id} ${camera.name}` : sighting.camera_id;
  if (sighting.source === "simulated" || sighting.source === "synthetic") {
    return <SimulatedSightingCard plate={sighting.plate_text} camera={name} time={sighting.timestamp} />;
  }
  const ref = sighting.plate_image_ref;
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return (
      <figure className="overflow-hidden rounded-xl border border-white/10">
        <img src={ref} alt={`Plate crop ${sighting.plate_text}`} className="h-24 w-full object-cover" />
        <figcaption className="px-2 py-1 font-mono text-xs">{sighting.plate_text}</figcaption>
      </figure>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-800/60 p-3 text-sm">
      <p>{ref ? "Camera image path returned, but the API does not serve image files yet." : "No camera image exists for this event"}</p>
      {ref ? <p className="mt-1 font-mono text-xs text-white/50">{ref}</p> : null}
      <p className="mt-1 font-mono">{sighting.plate_text}</p>
    </div>
  );
}
