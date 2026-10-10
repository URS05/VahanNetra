export const CONFIG = {
  apiBase:
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_BASE ||
    "http://127.0.0.1:8000",
  mapStyle:
    import.meta.env.VITE_MAP_STYLE_URL ||
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  routingUrl:
    import.meta.env.VITE_ROUTING_URL || "https://router.project-osrm.org",
  loginVideo:
    import.meta.env.VITE_LOGIN_VIDEO_URL ||
    "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4",
  mapCenter: { longitude: 78.367, latitude: 17.443, zoom: 12.2 },
  alertPopupMs: 8000,
  eventsPollMs: 5000,
  healthPollMs: 8000,
  playbackSecondsPerClockMinute: 1,
  minPlaybackMs: 7000,
  heatmapRadiusPx: 48,
  platePattern: /^[A-Z0-9]{5,12}$/,
  useMock: String(import.meta.env.VITE_USE_MOCK || "false").toLowerCase() === "true",
} as const;

export const ROLES = ["viewer", "analyst", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const CAMERA_IDS = ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"] as const;

export const PRESET_IDS = [
  "normal_trip",
  "cloned_plate",
  "fuzzy_plate",
  "watchlist_hit",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];
