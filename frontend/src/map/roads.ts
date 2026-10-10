import { drivingRoute } from "../api/routing";
import type { Camera, RouteSegment } from "../api/types";
import { cameraById } from "../config/cameras";
import type { LonLat } from "../lib/geo";

export type ResolvedSegment = {
  from: string;
  to: string;
  kind: string;
  coordinates: LonLat[];
  approximate: boolean;
  unavailable: boolean;
  sameCamera: boolean;
};

export async function resolveRoads(
  segments: RouteSegment[],
  cameras: Camera[],
): Promise<ResolvedSegment[]> {
  const resolved: ResolvedSegment[] = [];
  for (const segment of segments) {
    const sameCamera = segment.from_camera === segment.to_camera;
    if (sameCamera) {
      resolved.push({
        from: segment.from_camera,
        to: segment.to_camera,
        kind: segment.kind,
        coordinates: [],
        approximate: false,
        unavailable: false,
        sameCamera: true,
      });
      continue;
    }
    if (segment.routing_source === "osrm" && segment.coordinates.length >= 2) {
      resolved.push({
        from: segment.from_camera,
        to: segment.to_camera,
        kind: segment.kind,
        coordinates: segment.coordinates,
        approximate: false,
        unavailable: false,
        sameCamera: false,
      });
      continue;
    }
    const start = cameraById(cameras, segment.from_camera);
    const end = cameraById(cameras, segment.to_camera);
    if (!start || !end) {
      resolved.push({
        from: segment.from_camera,
        to: segment.to_camera,
        kind: segment.kind,
        coordinates: [],
        approximate: false,
        unavailable: true,
        sameCamera: false,
      });
      continue;
    }
    const routed = await drivingRoute([start.lon, start.lat], [end.lon, end.lat]);
    resolved.push({
      from: segment.from_camera,
      to: segment.to_camera,
      kind: segment.kind,
      coordinates: routed ?? [],
      approximate: Boolean(routed),
      unavailable: !routed,
      sameCamera: false,
    });
  }
  return resolved;
}
