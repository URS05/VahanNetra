const IST = "Asia/Kolkata";

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return "No data yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")} ${pick("month")} ${pick("year")}, ${pick("hour")}:${pick("minute")}:${pick("second")} IST`;
}

export function formatRelative(iso: string, originIso: string): string {
  const delta = new Date(iso).getTime() - new Date(originIso).getTime();
  if (Number.isNaN(delta)) return "";
  const sign = delta < 0 ? "-" : "+";
  const abs = Math.abs(delta);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  if (minutes <= 0) return `${sign}${seconds}s from first`;
  return `${sign}${minutes}m ${seconds}s from first`;
}

export function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function rangeFrom(preset: "1h" | "24h" | "7d"): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime());
  if (preset === "1h") from.setHours(from.getHours() - 1);
  if (preset === "24h") from.setHours(from.getHours() - 24);
  if (preset === "7d") from.setDate(from.getDate() - 7);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function isSameIstDay(iso: string, now = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso)) === fmt.format(now);
}

export function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
