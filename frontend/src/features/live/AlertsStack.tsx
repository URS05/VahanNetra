import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { AlertItem, Event } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { Button } from "../../components/ui/Button";
import { CONFIG } from "../../config";
import { formatIst } from "../../lib/format";

export function AlertsStack({
  incoming,
  history,
  events,
  onOpen,
}: {
  incoming: AlertItem[];
  history: AlertItem[];
  events: Event[];
  onOpen: (alert: AlertItem) => void;
}) {
  const [popups, setPopups] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<number>>(new Set());
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const fresh = incoming.filter((alert) => !seen.current.has(alert.id));
    if (!fresh.length) return;
    fresh.forEach((alert) => seen.current.add(alert.id));
    setPopups((prev) => [...fresh, ...prev].slice(0, 4));
    fresh.forEach((alert) => {
      const timer = window.setTimeout(() => {
        setPopups((prev) => prev.filter((item) => item.id !== alert.id));
      }, CONFIG.alertPopupMs);
      timers.current.push(timer);
    });
  }, [incoming]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const drawer = mergeAlerts(history, incoming);

  return (
    <>
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex w-[min(360px,92vw)] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {popups.map((alert) => (
            <motion.button
              key={alert.id}
              type="button"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="pointer-events-auto rounded-2xl border border-red-200/30 bg-black/80 p-3 text-left shadow-nav backdrop-blur"
              onClick={() => onOpen(alert)}
            >
              <AlertBody alert={alert} events={events} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <div className="absolute bottom-3 right-3 z-20">
        <Button variant="ghost" onClick={() => setOpen((value) => !value)}>
          Alerts ({drawer.length})
        </Button>
        {open ? (
          <div className="mt-2 max-h-80 w-[min(360px,92vw)] overflow-auto rounded-2xl border border-white/10 bg-black/80 p-2 backdrop-blur">
            {drawer.length === 0 ? <p className="p-2 text-sm text-white/60">No data yet</p> : null}
            <ul className="space-y-2">
              {drawer.map((alert) => (
                <li key={alert.id}>
                  <button type="button" className="w-full rounded-xl px-2 py-2 text-left hover:bg-white/5" onClick={() => onOpen(alert)}>
                    <AlertBody alert={alert} events={events} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}

function mergeAlerts(history: AlertItem[], incoming: AlertItem[]): AlertItem[] {
  const map = new Map<number, AlertItem>();
  [...incoming, ...history].forEach((alert) => map.set(alert.id, alert));
  return [...map.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function AlertBody({ alert, events }: { alert: AlertItem; events: Event[] }) {
  const related = events.filter((event) => event.plate_text === alert.plate_text);
  const simulated = related.some((event) => event.source === "simulated");
  const synthetic = related.some((event) => event.source === "synthetic");
  const title = alert.kind === "watchlist" ? "Watchlist hit" : alert.kind === "cloned_plate" ? "Impossible travel" : alert.kind;
  const sentence = alert.kind === "cloned_plate" ? clonedSentence(related, alert.message) : alert.message;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-[10px] uppercase text-red-200">{alert.priority} severity</span>
      </div>
      <p className="font-mono text-sm">{alert.plate_text}</p>
      <p className="text-xs text-white/70">{sentence}</p>
      <p className="font-mono text-[11px] text-white/50">
        {alert.camera_id} · {formatIst(alert.timestamp)}
      </p>
      <div className="mt-1">{simulated ? <SourceTag source="simulated" /> : synthetic ? <SourceTag source="synthetic" /> : null}</div>
    </div>
  );
}

function clonedSentence(events: Event[], fallback: string): string {
  const rows = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let best: { left: Event; right: Event; gap: number } | null = null;
  for (let index = 1; index < rows.length; index += 1) {
    const left = rows[index - 1];
    const right = rows[index];
    if (left.camera_id === right.camera_id) continue;
    const gap = Math.abs(new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
    if (!best || gap < best.gap) best = { left, right, gap };
  }
  if (!best) return fallback;
  const minutes = Math.max(1, Math.round(best.gap / 60000));
  return `Impossible travel: same plate seen at ${best.left.camera_id} and ${best.right.camera_id} within ${minutes} minutes`;
}
