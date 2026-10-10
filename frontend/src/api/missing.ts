export class NotImplementedError extends Error {
  readonly code = "NOT_IMPLEMENTED" as const;

  constructor(public endpoint: string) {
    super(`Backend endpoint not available yet: ${endpoint}`);
    this.name = "NotImplementedError";
  }
}

export function analyticsSpeedOverTime(): Promise<never> {
  return Promise.reject(
    new NotImplementedError("GET /api/analytics/speed/timeseries"),
  );
}

export function analyticsSpeedBySegment(): Promise<never> {
  return Promise.reject(
    new NotImplementedError("GET /api/analytics/speed/segments"),
  );
}
