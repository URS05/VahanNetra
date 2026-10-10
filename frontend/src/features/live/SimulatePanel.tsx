import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listPresets } from "../../api/simulate";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { CAMERA_IDS, PRESET_IDS, type PresetId } from "../../config";
import { plateError, normalizePlate } from "../../lib/plates";

export function SimulatePanel({
  busy,
  active,
  playing,
  speed,
  approximate,
  unavailable,
  onSimulate,
  onToggle,
  onRestart,
  onSpeed,
}: {
  busy: boolean;
  active: boolean;
  playing: boolean;
  speed: number;
  approximate: boolean;
  unavailable: boolean;
  onSimulate: (input: { plate: string; preset: PresetId; cameraOrder: string[] }) => void;
  onToggle: () => void;
  onRestart: () => void;
  onSpeed: (speed: number) => void;
}) {
  const presets = useQuery({ queryKey: ["presets"], queryFn: listPresets });
  const [plate, setPlate] = useState("");
  const [preset, setPreset] = useState<PresetId>("normal_trip");
  const [start, setStart] = useState<string>(CAMERA_IDS[0]);
  const [end, setEnd] = useState<string>(CAMERA_IDS[4]);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const debounced = useDebounced(plate, 250);
  const liveError = debounced ? plateError(debounced) : null;
  const description = presets.data?.[preset]?.description;

  const order = useMemo(() => cameraOrder(start, end), [start, end]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCollapsed(false);
        }}
        className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-left text-sm text-white shadow-nav backdrop-blur-md transition-colors hover:bg-black/70"
        title="Simulate (Click or Right-Click to expand)"
      >
        <svg className="h-4 w-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wide text-white/80">Simulate</span>
      </button>
    );
  }

  return (
    <Panel 
      title="Simulate"
      action={
        <button
          onClick={() => setCollapsed(true)}
          className="text-white/60 transition-colors hover:text-white"
          title="Collapse"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      }
    >
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const message = plateError(plate);
          if (message) {
            setError(message);
            return;
          }
          setError(null);
          onSimulate({ plate: normalizePlate(plate), preset, cameraOrder: order });
        }}
      >
        <label className="block text-xs text-white/60" htmlFor="sim-plate">
          Plate
        </label>
        <input
          id="sim-plate"
          value={plate}
          onChange={(event) => setPlate(event.target.value.toUpperCase())}
          className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 font-mono uppercase"
          autoComplete="off"
        />
        <p className="text-xs text-white/50">Route {order[0]} to {order[order.length - 1]}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-white/60">
            Start
            <select className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2" value={start} onChange={(event) => setStart(event.target.value)}>
              {CAMERA_IDS.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-white/60">
            End
            <select className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2" value={end} onChange={(event) => setEnd(event.target.value)}>
              {CAMERA_IDS.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-white/60" htmlFor="sim-preset">
          Preset
        </label>
        <select
          id="sim-preset"
          className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2"
          value={preset}
          onChange={(event) => setPreset(event.target.value as PresetId)}
        >
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        {presets.isError ? <EmptyState title="Preset list failed to load" /> : null}
        {description ? <p className="text-xs text-white/60">{description}</p> : null}
        {error || liveError ? <p className="text-xs text-red-200">{error || liveError}</p> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Simulating" : "Simulate"}
        </Button>
      </form>
      {active ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          {approximate ? <p className="text-xs text-amber-100">Approximate road route</p> : null}
          {unavailable ? <p className="text-xs text-red-200">Road geometry unavailable for part of this route</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onToggle}>{playing ? "Pause" : "Play"}</Button>
            <Button variant="ghost" onClick={onRestart}>Restart</Button>
            {[1, 2, 4].map((value) => (
              <Button key={value} variant={speed === value ? "solid" : "ghost"} onClick={() => onSpeed(value)}>
                {value}x
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function cameraOrder(start: string, end: string): string[] {
  const ids = [...CAMERA_IDS];
  const a = ids.indexOf(start as (typeof CAMERA_IDS)[number]);
  const b = ids.indexOf(end as (typeof CAMERA_IDS)[number]);
  if (a < 0 || b < 0) return [start];
  if (a <= b) return ids.slice(a, b + 1);
  return ids.slice(b, a + 1).reverse();
}

function useDebounced(value: string, ms: number): string {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return current;
}
