import { api } from "./client";
import type { WatchItem } from "./types";

export function listWatchlist(): Promise<WatchItem[]> {
  return api<WatchItem[]>("/api/watchlist");
}

export function addWatchlist(plateText: string, note: string): Promise<WatchItem> {
  return api<WatchItem>("/api/watchlist", {
    method: "POST",
    body: JSON.stringify({ plate_text: plateText, note }),
  });
}

export function removeWatchlist(plate: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/watchlist/${encodeURIComponent(plate)}`, {
    method: "DELETE",
  });
}
