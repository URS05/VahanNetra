import { api } from "./client";
import type { PlateSearch } from "./types";

export function searchPlates(q: string): Promise<PlateSearch> {
  const params = new URLSearchParams({ q, fuzzy: "true" });
  return api<PlateSearch>(`/api/plates/search?${params.toString()}`);
}
