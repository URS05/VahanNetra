import { CONFIG } from "../config";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function detailFrom(body: unknown, fallback: string): string {
  if (typeof body === "object" && body && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const token = useAuth.getState().token;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type") && rest.body) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (auth && token) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${CONFIG.apiBase}${path}`, {
      ...rest,
      headers: finalHeaders,
    });
  } catch {
    useUi.getState().setApiDown(true);
    throw new ApiError(
      0,
      `Cannot reach API at ${CONFIG.apiBase.replace(/^https?:\/\//, "")}`,
    );
  }

  if (response.status === 401 && auth) {
    useAuth.getState().clear();
    useUi.getState().expireSession();
    throw new ApiError(401, "Session expired");
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const fallback =
      response.status === 403
        ? "Not permitted for your role"
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, detailFrom(body, fallback));
  }

  useUi.getState().setApiDown(false);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function wsUrl(path: string): string {
  const base = CONFIG.apiBase.replace(/^http/, "ws");
  return `${base}${path}`;
}
