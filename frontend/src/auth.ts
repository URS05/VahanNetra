import type { Role } from "./config";

const TOKEN_KEY = "vn_token";
const ROLE_KEY = "vn_role";

export function saveSession(token: string, role: Role): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(ROLE_KEY, role);
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ROLE_KEY);
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getRole(): Role | null {
  const r = sessionStorage.getItem(ROLE_KEY);
  if (r === "viewer" || r === "analyst" || r === "admin") return r;
  return null;
}

export function canSearch(role: Role | null): boolean {
  return role === "analyst" || role === "admin";
}

export function canSimulate(role: Role | null): boolean {
  return role === "analyst" || role === "admin";
}

export function canWriteWatchlist(role: Role | null): boolean {
  return role === "analyst" || role === "admin";
}
