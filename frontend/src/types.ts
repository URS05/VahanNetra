export type Direction =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW"
  | "IN"
  | "OUT";

export type VehicleType = "car" | "bike" | "truck" | "bus" | "auto" | "other";
export type SourceTier = "real_clip" | "simulated" | "synthetic";
export type MatchType = "exact" | "possible";

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
  direction: Direction;
  lane: number;
  vehicle_type: VehicleType;
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
  snapped_distance_m?: number;
  osm_name?: string;
  video_file?: string;
};

export type PathSegment = {
  from_camera: string;
  to_camera: string;
  inferred: boolean;
  distance_m: number;
  duration_s: number;
  coordinates: [number, number][];
};

export type SimulateIn = {
  plate: string;
  camera_order: string[];
  start_time: string | null;
  speed_factor: number;
  jitter_pct: number;
  preset?: string | null;
};

export type SimulateOut = {
  events: Event[];
  path_segments: PathSegment[];
};

export type SimulatePreset = {
  id: "normal_trip" | "cloned_plate" | "fuzzy_plate" | "watchlist_hit";
  label: string;
  plate: string;
  camera_order: string[];
  notes: string;
};

export type PlateSearchHit = {
  event: Event;
  match_type: MatchType;
};

export type TrajectoryOut = {
  plate: string;
  match_type: MatchType;
  cloned_plate: boolean;
  sightings: Event[];
  segments: PathSegment[];
};

export type DensityRow = {
  bucket: string;
  camera_id: string;
  count: number;
};

export type SpeedRow = {
  camera_id: string;
  avg_speed_kmh: number;
};

export type OdFlow = {
  origin: string;
  destination: string;
  count: number;
};

export type CongestionHotspot = {
  camera_id: string;
  name: string;
  score: number;
  label: string;
};

export type HeatmapPoint = {
  lon: number;
  lat: number;
  weight: number;
  t: number;
};

export type WatchlistItem = {
  plate: string;
  added_at: string;
  added_by: string;
};

export type AlertItem = {
  alert_id: string;
  type: "watchlist" | "impossible_travel" | "cloned_plate";
  plate: string;
  message: string;
  timestamp: string;
  camera_id: string;
  severity: "high" | "medium";
};

export type AuditItem = {
  audit_id: string;
  actor_role: string;
  action: string;
  detail: string;
  timestamp: string;
};

export type LoginOut = {
  token: string;
  role: "viewer" | "analyst" | "admin";
};
