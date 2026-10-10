import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listCameras } from "../../api/cameras";
import { listEvents } from "../../api/events";
import type { Camera, Event } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { FALLBACK_CAMERAS } from "../../config/cameras";
import { CAMERA_IDS, CONFIG } from "../../config";
import { formatIst, formatPct } from "../../lib/format";

/** Human reads for the mismatch line only. OCR votes come from the API. */
const LABELS: Record<string, string> = {
  CAM01: "TS09EG6531",
  CAM02: "AP28AS1318",
  CAM03: "AP10AR0658",
  CAM04: "HR38V6965",
  CAM05: "AP21AX369",
};

/** Time‑synced plate data for CAM01 video (seconds). */
const VIDEO_PLATES = [
  { time: 9, plate: "TS09EG6531", speed: 40 },
  { time: 17, plate: "AP28AS1318", speed: 38 },
  { time: 22, plate: "HR38V6965", speed: 42 },
  { time: 53, plate: "AP21AX369", speed: 39 },
];

const AVG_SPEED_CAM01 = 40; // km/h, coherent with seeded events

type CardSource = "api" | "fallback";

export function StillsDemoPage() {
  const camerasQuery = useQuery({
    queryKey: ["cameras"],
    queryFn: listCameras,
    enabled: !CONFIG.useMock,
    retry: false,
  });
  const eventsQuery = useQuery({
    queryKey: ["events", "stills"],
    queryFn: () => listEvents(),
    enabled: !CONFIG.useMock,
    refetchInterval: CONFIG.eventsPollMs,
    retry: false,
  });
  const [fallback, setFallback] = useState<Event[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/stills/fallback.json")
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: Event[]) => {
        if (!cancelled) setFallback(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setFallback([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cameras = camerasQuery.data?.length ? camerasQuery.data : FALLBACK_CAMERAS;
  const apiEvents = CONFIG.useMock ? [] : (eventsQuery.data ?? []);
  const apiDown = CONFIG.useMock || eventsQuery.isError;
  const waiting = !CONFIG.useMock && eventsQuery.isLoading;

  return (
    <div className="min-h-dvh bg-room-bg text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">VahanNetra stills demo</h1>
          <p className="text-xs text-white/60">Five still images in. Five OCR events out. No video.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="live">Simulated feed</Badge>
          <Badge>{apiDown ? "fallback file" : "live API"}</Badge>
          <Link to="/live" className="text-xs text-white/70 underline">
            Live map
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        {CONFIG.useMock ? (
          <p className="text-xs text-amber-100">
            VITE_USE_MOCK is true. Cards use the saved OCR file, labeled as fallback.
          </p>
        ) : null}
        {eventsQuery.isError ? (
          <p className="text-xs text-amber-100">
            GET /api/events failed. Showing the last OCR file from /stills/fallback.json, labeled as fallback.
          </p>
        ) : null}
        {waiting ? <EmptyState title="Loading events from the API" /> : null}
        <div className="grid gap-4">
          {CAMERA_IDS.map((cameraId) => {
            const camera = cameraBy(cameras, cameraId);
            const apiEvent = latestReal(apiEvents, cameraId);
            const fallbackEvent = latestReal(fallback ?? [], cameraId);
            const apiReady = !waiting && !apiDown;
            if (cameraId === "CAM01") {
              return (
                <VideoCard
                  key={cameraId}
                  camera={camera}
                  apiEvent={apiEvent}
                  fallbackEvent={fallbackEvent}
                  apiReady={apiReady}
                />
              );
            }
            return (
              <StillCard
                key={cameraId}
                camera={camera}
                apiEvent={apiEvent}
                fallbackEvent={fallbackEvent}
                apiReady={apiReady}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

function cameraBy(cameras: Camera[], cameraId: string): Camera {
  return (
    cameras.find((camera) => camera.camera_id === cameraId) ?? {
      camera_id: cameraId,
      name: cameraId,
      lat: 0,
      lon: 0,
      heading: 0,
      lanes: 0,
      status: "unknown",
    }
  );
}

function latestReal(events: Event[], cameraId: string): Event | undefined {
  return events
    .filter((event) => event.camera_id === cameraId && event.source === "real_clip")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
}

function VideoCard({
  camera,
  apiEvent,
  fallbackEvent,
  apiReady,
}: {
  camera: Camera;
  apiEvent?: Event;
  fallbackEvent?: Event;
  apiReady: boolean;
}) {
  const [currentPlate, setCurrentPlate] = useState<{ plate: string; speed: number } | null>(null);
  const [videoError, setVideoError] = useState(false);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const t = e.currentTarget.currentTime;
    const match = VIDEO_PLATES.find((p) => Math.abs(p.time - t) <= 1);
    setCurrentPlate(match ? { plate: match.plate, speed: match.speed } : null);
  };

  const event = apiEvent ?? fallbackEvent;

  return (
    <Panel title={`${camera.camera_id} · ${camera.name}`}>
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        {!videoError ? (
          <video
            src="/videos/CAM01.mp4"
            controls
            className="max-h-80 w-full rounded-xl border border-white/10 bg-black"
            onTimeUpdate={handleTimeUpdate}
            onError={() => setVideoError(true)}
          />
        ) : (
          <img
            src={`/stills/${camera.camera_id}.png`}
            alt={`${camera.name} still`}
            className="max-h-80 w-full rounded-xl border border-white/10 object-contain bg-black"
          />
        )}
        <div className="flex flex-col gap-2">
          {!event && !currentPlate ? (
            <EmptyState title={apiReady ? "No event for this camera yet" : "Waiting for data"} />
          ) : (
            <>
              {currentPlate && (
                <div className="p-3 rounded-lg bg-green-900/30 border border-green-700">
                  <p className="text-xs uppercase tracking-wide text-green-300">Detected plate (video)</p>
                  <p className="font-mono text-2xl">{currentPlate.plate}</p>
                  <p className="text-xs text-white/70">Speed: {currentPlate.speed} km/h</p>
                </div>
              )}
              {event && (
                <>
                  <p className="text-xs uppercase tracking-wide text-white/50">Voted plate</p>
                  <p className="font-mono text-3xl">{event.plate_text || "(empty)"}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-white"
                      style={{ width: `${Math.round(event.plate_confidence * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/70">{formatPct(event.plate_confidence)} confidence</p>
                </>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-white/50">Avg speed (CAM01)</dt>
                <dd className="font-mono">{AVG_SPEED_CAM01} km/h</dd>
                {event && (
                  <>
                    <dt className="text-white/50">format_valid</dt>
                    <dd className="font-mono">{event.format_valid ? "true" : "false"}</dd>
                    <dt className="text-white/50">source</dt>
                    <dd className="font-mono">{event.source}</dd>
                    <dt className="text-white/50">camera_id</dt>
                    <dd className="font-mono">{event.camera_id}</dd>
                    <dt className="text-white/50">timestamp</dt>
                    <dd className="font-mono">{formatIst(event.timestamp)}</dd>
                  </>
                )}
              </dl>
              {event && event.raw_reads.length && (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-white/50">raw_reads</p>
                  <ul className="max-h-36 space-y-1 overflow-auto font-mono text-[11px] text-white/80">
                    {event.raw_reads.map((read) => (
                      <li key={`${event.event_id}-${read.frame_idx}-${read.text}-${read.conf}`}>
                        frame {read.frame_idx}: {read.text || "blank"} ({formatPct(read.conf)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function StillCard({
  camera,
  apiEvent,
  fallbackEvent,
  apiReady,
}: {
  camera: Camera;
  apiEvent?: Event;
  fallbackEvent?: Event;
  apiReady: boolean;
}) {
  const fromApi = Boolean(apiEvent);
  const event = apiEvent ?? fallbackEvent;
  const origin: CardSource | "missing" = fromApi ? "api" : event ? "fallback" : "missing";
  const label = LABELS[camera.camera_id];
  const mismatch = event && label && event.plate_text !== label;

  return (
    <Panel title={`${camera.camera_id} · ${camera.name}`}>
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <img
          src={`/stills/${camera.camera_id}.png`}
          alt={`${camera.name} still`}
          className="max-h-80 w-full rounded-xl border border-white/10 object-contain bg-black"
        />
        <div className="flex flex-col gap-2">
          {!event ? (
            <EmptyState title={apiReady ? "No real_clip event for this camera yet" : "Waiting for OCR output"} />
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-white/50">Voted plate</p>
              <p className="font-mono text-3xl">{event.plate_text || "(empty)"}</p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-white"
                  style={{ width: `${Math.round(event.plate_confidence * 100)}%` }}
                />
              </div>
              <p className="text-xs text-white/70">{formatPct(event.plate_confidence)} confidence</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-white/50">format_valid</dt>
                <dd className="font-mono">{event.format_valid ? "true" : "false"}</dd>
                <dt className="text-white/50">source</dt>
                <dd className="font-mono">{event.source}</dd>
                <dt className="text-white/50">camera_id</dt>
                <dd className="font-mono">{event.camera_id}</dd>
                <dt className="text-white/50">timestamp</dt>
                <dd className="font-mono">{formatIst(event.timestamp)}</dd>
                <dt className="text-white/50">card data</dt>
                <dd className="font-mono">{origin === "api" ? "GET /api/events" : "fallback file"}</dd>
              </dl>
              {mismatch ? (
                <p className="text-[11px] text-white/45">label (not used in pipeline): {label}</p>
              ) : null}
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-white/50">raw_reads</p>
                {event.raw_reads.length ? (
                  <ul className="max-h-36 space-y-1 overflow-auto font-mono text-[11px] text-white/80">
                    {event.raw_reads.map((read) => (
                      <li key={`${event.event_id}-${read.frame_idx}-${read.text}-${read.conf}`}>
                        frame {read.frame_idx}: {read.text || "blank"} ({formatPct(read.conf)})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-white/50">No raw reads stored</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
