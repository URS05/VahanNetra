import { api } from "./client";
import type { Congestion, Density, Heatmap, OriginDestination, SpeedReport } from "./types";

export function getDensity(from?: string, to?: string): Promise<Density> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("bucket", "3600");
  const q = params.toString();
  return api<Density>(`/api/analytics/density${q ? `?${q}` : ""}`, { auth: false });
}

export function getSpeed(): Promise<SpeedReport> {
  return api<SpeedReport>("/api/analytics/speed", { auth: false });
}

export function getOd(): Promise<OriginDestination> {
  return api<OriginDestination>("/api/analytics/od", { auth: false });
}

export function getCongestion(): Promise<Congestion> {
  return api<Congestion>("/api/analytics/congestion", { auth: false });
}

export function getHeatmap(t?: string): Promise<Heatmap> {
  const q = t ? `?t=${encodeURIComponent(t)}` : "";
  return api<Heatmap>(`/api/analytics/heatmap${q}`, { auth: false });
}
