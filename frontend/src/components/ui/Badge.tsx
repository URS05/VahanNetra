import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "live" | "role" }) {
  const toneClass =
    tone === "live"
      ? "border-amber-200/40 bg-amber-200/15 text-amber-100"
      : tone === "role"
        ? "border-white/20 bg-white text-black"
        : "border-white/15 bg-white/10 text-white/80";
  return (
    <span className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
