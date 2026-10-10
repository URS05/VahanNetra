export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center">
      <p className="text-sm text-white/80">{title}</p>
      {detail ? <p className="mt-1 text-xs text-white/50">{detail}</p> : null}
    </div>
  );
}
