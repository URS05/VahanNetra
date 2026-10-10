import { CONFIG } from "../config";
import type { LonLat } from "../lib/geo";

const cache = new Map<string, LonLat[] | null>();

export async function drivingRoute(from: LonLat, to: LonLat): Promise<LonLat[] | null> {
  const key = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const url = `${CONFIG.routingUrl.replace(/\/$/, "")}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      cache.set(key, null);
      return null;
    }
    const body = (await response.json()) as {
      routes?: { geometry?: { coordinates?: LonLat[] } }[];
    };
    const coords = body.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      cache.set(key, null);
      return null;
    }
    cache.set(key, coords);
    return coords;
  } catch {
    cache.set(key, null);
    return null;
  }
}
