import { cameraById } from "../data/cameras";

export type LonLat = [number, number];

export function haversineM(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function curvePath(a: LonLat, b: LonLat, n = 18): LonLat[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = mx - dy * 0.14;
  const cy = my + dx * 0.14;
  const pts: LonLat[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * cx + t * t * b[0],
      u * u * a[1] + 2 * u * t * cy + t * t * b[1],
    ]);
  }
  return pts;
}

export function pathLength(coords: LonLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i += 1) {
    sum += haversineM(coords[i - 1], coords[i]);
  }
  return sum;
}

export function interpolatePath(coords: LonLat[], t: number): LonLat {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1 || t <= 0) return coords[0];
  if (t >= 1) return coords[coords.length - 1];
  const total = pathLength(coords);
  let remain = total * t;
  for (let i = 1; i < coords.length; i += 1) {
    const seg = haversineM(coords[i - 1], coords[i]);
    if (remain <= seg) {
      const f = seg === 0 ? 0 : remain / seg;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
      ];
    }
    remain -= seg;
  }
  return coords[coords.length - 1];
}

export function cameraLonLat(id: string): LonLat {
  const c = cameraById(id);
  if (!c) return [78.367, 17.443];
  return [c.lon, c.lat];
}

export function flattenSegments(
  segs: { coordinates: LonLat[] }[],
): LonLat[] {
  const out: LonLat[] = [];
  segs.forEach((s, i) => {
    s.coordinates.forEach((p, j) => {
      if (i > 0 && j === 0) return;
      out.push(p);
    });
  });
  return out;
}

export function bearingDeg(a: LonLat, b: LonLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) *
      Math.cos(toRad(b[1])) *
      Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}
