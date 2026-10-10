import { api } from "./client";
import type { AuditItem } from "./types";

export function listAudit(): Promise<AuditItem[]> {
  return api<AuditItem[]>("/api/audit");
}
