import { api } from "./client";
import type { SimulatePreset, SimulateResult } from "./types";

export function listPresets(): Promise<Record<string, SimulatePreset>> {
  return api<Record<string, SimulatePreset>>("/api/simulate/presets");
}

export function runSimulate(body: {
  plate: string;
  camera_order: string[];
  start_time: string | null;
  speed_factor: number;
  jitter_pct: number;
  preset: string;
}): Promise<SimulateResult> {
  return api<SimulateResult>("/api/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
