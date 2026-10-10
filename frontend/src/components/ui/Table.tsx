import type { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-white/10">
      <table className="min-w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
