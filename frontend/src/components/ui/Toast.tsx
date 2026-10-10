import { useEffect } from "react";
import { useUi } from "../../store/ui";

export function ToastHost() {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismissToast);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) => window.setTimeout(() => dismiss(toast.id), 4200));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-nav ${
            toast.tone === "error"
              ? "border-red-300/40 bg-red-950/90 text-red-50"
              : "border-white/15 bg-neutral-900/95 text-white"
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
