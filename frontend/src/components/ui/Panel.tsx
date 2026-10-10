import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  className = "",
  action,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-black/55 text-sm text-white shadow-nav backdrop-blur-md ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}
