import { api } from "./client";
import type { Trajectory } from "./types";

export function getTrajectory(plate: string): Promise<Trajectory> {
  return api<Trajectory>(`/api/trajectory/${encodeURIComponent(plate)}?fuzzy=true`);
}
