/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_ROUTING_URL?: string;
  readonly VITE_LOGIN_VIDEO_URL?: string;
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
