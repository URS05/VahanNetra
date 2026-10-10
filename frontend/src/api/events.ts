import { api } from "./client";
import type { Event } from "./types";

export function listEvents(cameraId?: string): Promise<Event[]> {
  const query = cameraId ? `?camera_id=${encodeURIComponent(cameraId)}&limit=200` : "?limit=200";
  return api<Event[]>(`/api/events${query}`, { auth: false });
}
