import { api } from "./client";
import type { Camera } from "./types";

export function listCameras(): Promise<Camera[]> {
  return api<Camera[]>("/api/cameras", { auth: false });
}
