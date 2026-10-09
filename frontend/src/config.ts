export const CONFIG = {
  apiBase: import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000",
  useMock: import.meta.env.VITE_USE_MOCK !== "false",
  mapCenter: { longitude: 78.367, latitude: 17.443, zoom: 12.4 },
  heatmapRadiusPx: 55,
  mockLatencyMs: 140,
  demoAnimMs: 16000,
  tickerSize: 8,
  fuzzyMaxDistance: 1,
  bodyMinPx: 14,
  liveTickMs: 4000,
} as const;

export const ROLES = ["viewer", "analyst", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const CAMERA_ORDER_DEFAULT = [
  "CAM01",
  "CAM02",
  "CAM03",
  "CAM04",
  "CAM05",
] as const;
