import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { searchPlates } from "../../api/plates";
import type { Event } from "../../api/types";
import { SourceTag } from "../../components/SourceTag";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { formatIst } from "../../lib/format";
import { editDistance, normalizePlate, plateError } from "../../lib/plates";

export function SearchPanel({
  events,
  onOpen,
}: {
  events: Event[];
  onOpen: (plate: string) => void;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const search = useQuery({
    queryKey: ["plates", query],
    queryFn: () => searchPlates(query),
    enabled: Boolean(query),
    retry: false,
  });

  const exact = search.data?.results.filter((hit) => hit.match_type === "exact") ?? [];
  const possible = search.data?.results.filter((hit) => hit.match_type === "possible") ?? [];

  return (
    <Panel title="Plate search">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const message = plateError(text);
          if (message) {
            setFormError(message);
            return;
          }
          setFormError(null);
          setQuery(normalizePlate(text));
        }}
      >
        <label className="sr-only" htmlFor="plate-search">
          Plate
        </label>
        <input
          id="plate-search"
          value={text}
          onChange={(event) => setText(event.target.value.toUpperCase())}
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-2 font-mono uppercase"
        />
        <Button type="submit">Search</Button>
      </form>
      {formError ? <p className="mt-2 text-xs text-red-200">{formError}</p> : null}
      {search.isLoading ? <p className="mt-3 text-xs text-white/60">Searching</p> : null}
      {search.isError ? (
        <p className="mt-3 text-sm">
          {search.error instanceof ApiError && search.error.status === 403
            ? "Not permitted for your role"
            : search.error instanceof Error
              ? search.error.message
              : "Search failed"}
        </p>
      ) : null}
      {search.data && search.data.results.length === 0 ? <div className="mt-3"><EmptyState title="No data yet" /></div> : null}
      {exact.length ? (
        <section className="mt-3">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-white/60">Exact match</h3>
          <ul className="space-y-2">
            {exact.map((hit) => (
              <Hit key={hit.plate_text} plate={hit.plate_text} query={query} events={events} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ) : null}
      {possible.length ? (
        <section className="mt-3">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-white/60">
            Possible match (one character different)
          </h3>
          <ul className="space-y-2">
            {possible.map((hit) => (
              <Hit key={hit.plate_text} plate={hit.plate_text} query={query} events={events} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}

function Hit({
  plate,
  query,
  events,
  onOpen,
}: {
  plate: string;
  query: string;
  events: Event[];
  onOpen: (plate: string) => void;
}) {
  const rows = events.filter((event) => event.plate_text === plate);
  const last = [...rows].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const simulated = rows.some((event) => event.source === "simulated");
  const synthetic = rows.some((event) => event.source === "synthetic");
  const distance = editDistance(query, plate);
  return (
    <li>
      <button type="button" className="w-full rounded-xl border border-white/10 px-2 py-2 text-left hover:bg-white/5" onClick={() => onOpen(plate)}>
        <div className="flex items-center justify-between gap-2">
          <PlateDiff query={query} plate={plate} />
          {simulated ? <SourceTag source="simulated" /> : null}
          {!simulated && synthetic ? <SourceTag source="synthetic" /> : null}
        </div>
        <p className="text-[11px] text-white/50">{distance === 0 ? "Exact" : `${distance} character difference`}</p>
        <p className="text-xs text-white/70">
          {last ? `${last.camera_id} · ${formatIst(last.timestamp)} · ${rows.length} in latest events` : "Not in the latest 200 events"}
        </p>
      </button>
    </li>
  );
}

function PlateDiff({ query, plate }: { query: string; plate: string }) {
  const left = normalizePlate(query);
  const right = normalizePlate(plate);
  const size = Math.max(left.length, right.length);
  return (
    <span className="font-mono tracking-wide">
      {Array.from({ length: size }, (_, index) => {
        const ch = right[index] ?? "";
        const differ = left[index] !== right[index];
        return (
          <span key={`${ch}-${index}`} className={differ ? "rounded bg-amber-200/30 px-0.5 text-amber-100" : ""}>
            {ch || " "}
          </span>
        );
      })}
    </span>
  );
}
