import { api } from "./client";
import type { Health, LoginOut } from "./types";
import type { Role } from "../config";

export function login(role: Role): Promise<LoginOut> {
  return api<LoginOut>("/api/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ role }),
  });
}

export function health(): Promise<Health> {
  return api<Health>("/health", { auth: false });
}
