import { useEffect, useMemo, useState } from "react";
import { CONFIG } from "../config";
import {
  pathLength,
  pointAtDistance,
  projectDistance,
  type LonLat,
} from "../lib/geo";

export type PathStop = {
  id: string;
  at: LonLat;
  timeMs: number;
};

export function useAlongPath(options: {
  path: LonLat[];
  stops: PathStop[];
  playing: boolean;
  speed: number;
  runId: number;
}) {
  const { path, stops, playing, speed, runId } = options;
  const [distance, setDistance] = useState(0);
  const [revealed, setRevealed] = useState<string[]>([]);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const total = pathLength(path);

  const duration = useMemo(() => {
    if (stops.length < 2) return CONFIG.minPlaybackMs / Math.max(speed, 0.25);
    const times = stops.map((stop) => stop.timeMs);
    const span = Math.max(...times) - Math.min(...times);
    const scaled =
      span > 0
        ? (span / 60000) * CONFIG.playbackSecondsPerClockMinute * 1000
        : CONFIG.minPlaybackMs;
    return Math.max(CONFIG.minPlaybackMs, scaled) / Math.max(speed, 0.25);
  }, [stops, speed]);

  useEffect(() => {
    setDistance(0);
    setRevealed([]);
  }, [runId]);

  useEffect(() => {
    if (path.length <= 1) {
      if (stops.length <= 1 && (playing || reduced)) setRevealed(stops.map((stop) => stop.id));
      return;
    }
    if (reduced) {
      setDistance(total);
      setRevealed(stops.map((stop) => stop.id));
      return;
    }
    if (!playing || total <= 0) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setDistance((prev) => Math.min(total, prev + (total / duration) * dt));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, runId, reduced, path, stops, total, duration]);

  useEffect(() => {
    if (path.length <= 1) return;
    const next = stops
      .filter((stop) => projectDistance(path, stop.at) <= distance + 40)
      .map((stop) => stop.id);
    setRevealed((prev) =>
      prev.length === next.length && prev.every((id, index) => id === next[index]) ? prev : next,
    );
  }, [distance, path, stops]);

  const placed = pointAtDistance(path, path.length <= 1 ? 0 : distance);
  return {
    point: path[0] ? placed.point : null,
    bearing: placed.bearing,
    revealed,
    finished: path.length <= 1 || distance >= total - 1,
  };
}
