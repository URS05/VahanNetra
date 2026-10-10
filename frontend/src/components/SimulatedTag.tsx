export function SimulatedTag({ label = "Simulated" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-amber-200/50 bg-amber-200/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
      {label}
    </span>
  );
}
