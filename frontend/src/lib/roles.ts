import type { Role } from "../config";

export function canSearch(role: Role | null): boolean {
  return role === "analyst" || role === "admin";
}

export function canAudit(role: Role | null): boolean {
  return role === "analyst" || role === "admin";
}
