import { formatIst } from "../lib/format";

export function SimulatedSightingCard({
  plate,
  camera,
  time,
}: {
  plate: string;
  camera: string;
  time: string;
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-neutral-700/40 p-3 text-neutral-100">
      <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-neutral-600/50 text-neutral-200" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 12h10" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      <p className="text-sm font-semibold">Simulated sighting</p>
      <p className="text-xs text-neutral-300">No camera image exists for this event</p>
      <p className="mt-2 font-mono text-sm tracking-wide">{plate}</p>
      <p className="text-xs text-neutral-300">{camera}</p>
      <p className="font-mono text-[11px] text-neutral-300">{formatIst(time)}</p>
    </article>
  );
}
