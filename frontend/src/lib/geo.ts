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

export function pathLength(coords: LonLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i += 1) {
    sum += haversineM(coords[i - 1], coords[i]);
  }
  return sum;
}

export function flattenPath(parts: LonLat[][]): LonLat[] {
  const out: LonLat[] = [];
  parts.forEach((part, partIndex) => {
    part.forEach((point, pointIndex) => {
      if (partIndex > 0 && pointIndex === 0 && out.length) return;
      out.push(point);
    });
  });
  return out;
}

export function pointAtDistance(coords: LonLat[], distance: number): { point: LonLat; bearing: number } {
  if (coords.length === 0) return { point: [78.367, 17.443], bearing: 0 };
  if (coords.length === 1 || distance <= 0) {
    const next = coords[1] ?? coords[0];
    return { point: coords[0], bearing: bearingDeg(coords[0], next) };
  }
  let remain = distance;
  for (let i = 1; i < coords.length; i += 1) {
    const seg = haversineM(coords[i - 1], coords[i]);
    if (remain <= seg) {
      const f = seg === 0 ? 0 : remain / seg;
      const point: LonLat = [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
      ];
      return { point, bearing: bearingDeg(coords[i - 1], coords[i]) };
    }
    remain -= seg;
  }
  const last = coords[coords.length - 1];
  const prev = coords[coords.length - 2] ?? last;
  return { point: last, bearing: bearingDeg(prev, last) };
}

export function projectDistance(coords: LonLat[], target: LonLat): number {
  if (coords.length === 0) return 0;
  let best = Number.POSITIVE_INFINITY;
  let bestDist = 0;
  let walked = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const d = haversineM(coords[i], target);
    if (d < best) {
      best = d;
      bestDist = walked;
    }
    if (i < coords.length - 1) walked += haversineM(coords[i], coords[i + 1]);
  }
  return bestDist;
}

export function bearingDeg(a: LonLat, b: LonLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function sampleArrows(coords: LonLat[], spacingM = 450): { position: LonLat; angle: number }[] {
  const total = pathLength(coords);
  if (total < 80 || coords.length < 2) return [];
  const arrows: { position: LonLat; angle: number }[] = [];
  for (let d = spacingM; d < total - 40; d += spacingM) {
    const { point, bearing } = pointAtDistance(coords, d);
    arrows.push({ position: point, angle: bearing - 90 });
  }
  return arrows;
}

export function midpoint(coords: LonLat[]): LonLat | null {
  if (coords.length === 0) return null;
  const { point } = pointAtDistance(coords, pathLength(coords) / 2);
  return point;
}
