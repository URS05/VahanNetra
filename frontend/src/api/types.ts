import type { Role } from "../config";

export type SourceTier = "real_clip" | "simulated" | "synthetic";

export type RawRead = {
  frame_idx: number;
  text: string;
  conf: number;
};

export type Event = {
  event_id: string;
  plate_text: string;
  plate_confidence: number;
  format_valid: boolean;
  raw_reads: RawRead[];
  camera_id: string;
  timestamp: string;
  direction: string;
  lane: number;
  vehicle_type: string;
  vehicle_color: string;
  speed_estimate: number | null;
  plate_image_ref: string;
  source: SourceTier;
};

export type Camera = {
  camera_id: string;
  name: string;
  lat: number;
  lon: number;
  heading: number;
  lanes: number;
  status: string;
  video_file?: string;
  video_present?: boolean;
};

export type RouteSegment = {
  from_camera: string;
  to_camera: string;
  kind: string;
  distance_km?: number | null;
  duration_s?: number | null;
  travel_speed_kmh?: number | null;
  coordinates: [number, number][];
  routing_source?: string;
};

export type SimulatePreset = {
  id: string;
  description: string;
  camera_order: string[];
  speed_factor: number;
  jitter_pct: number;
  max_total_seconds?: number;
  fuzzy_camera?: string;
};

export type SimulateResult = {
  preset: string | null;
  plate: string;
  count: number;
  events: Event[];
  segments: RouteSegment[];
};

export type PlateHit = {
  plate_text: string;
  match_type: "exact" | "possible";
};

export type PlateSearch = {
  query: string;
  results: PlateHit[];
};

export type Sighting = {
  event_id: string;
  plate_text: string;
  camera_id: string;
  timestamp: string;
  direction: string;
  lat: number | null;
  lon: number | null;
  plate_image_ref: string;
  source: SourceTier;
  raw_reads: RawRead[];
  plate_confidence: number;
};

export type Trajectory = {
  query: string;
  resolved_plate?: string;
  match_type: "exact" | "possible" | null;
  sightings: Sighting[];
  segments: RouteSegment[];
  cloned_plate_flag: boolean;
};

export type Density = {
  by_camera: Record<string, Record<string, number>>;
};

export type SpeedReport = {
  average_speed_kmh: Record<string, number | null>;
};

export type OdFlow = {
  plate_text: string;
  origin: string;
  destination: string;
  from: [number, number];
  to: [number, number];
};

export type OriginDestination = {
  matrix: Record<string, Record<string, number>>;
  flows: OdFlow[];
};

export type Hotspot = {
  camera_id: string;
  count: number;
  score: number;
  severity: string;
};

export type Congestion = {
  hotspots: Hotspot[];
};

export type Heatmap = {
  t: string;
  points: { lat: number; lon: number; weight: number; camera_id: string }[];
};

export type WatchItem = {
  plate_text: string;
  note: string;
  created_at: string;
};

export type AlertItem = {
  id: number;
  kind: string;
  plate_text: string;
  camera_id: string;
  timestamp: string;
  direction: string;
  plate_image_ref: string;
  priority: string;
  message: string;
};

export type AuditItem = {
  id: number;
  user: string;
  role: string;
  query: string;
  time: string;
};

export type LoginOut = {
  token: string;
  role: Role;
  username: string;
};

export type Health = {
  ok: boolean;
  project: string;
  routing: string;
  cached_routes: number;
};
