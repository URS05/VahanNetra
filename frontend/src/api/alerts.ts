import { api } from "./client";
import type { AlertItem } from "./types";

export function listAlerts(): Promise<AlertItem[]> {
  return api<AlertItem[]>("/api/alerts", { auth: false });
}
