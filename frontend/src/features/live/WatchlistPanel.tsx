import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { addWatchlist, listWatchlist, removeWatchlist } from "../../api/watchlist";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { formatIst } from "../../lib/format";
import { normalizePlate, plateError } from "../../lib/plates";
import { useUi } from "../../store/ui";

export function WatchlistPanel() {
  const [plate, setPlate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pushToast = useUi((state) => state.pushToast);
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["watchlist"], queryFn: listWatchlist });
  const add = useMutation({
    mutationFn: () => addWatchlist(normalizePlate(plate), note.trim()),
    onSuccess: async () => {
      setPlate("");
      setNote("");
      pushToast("Added to watchlist", "ok");
      await client.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (err) => {
      pushToast(err instanceof ApiError ? err.detail : "Could not add plate", "error");
    },
  });
  const remove = useMutation({
    mutationFn: (value: string) => removeWatchlist(value),
    onSuccess: async () => {
      pushToast("Removed from watchlist", "ok");
      await client.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.detail : "Could not remove plate", "error"),
  });

  return (
    <Panel title="Watchlist">
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
          add.mutate();
        }}
      >
        <label className="block text-xs text-white/60" htmlFor="watch-plate">Plate</label>
        <input id="watch-plate" value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 font-mono uppercase" />
        <label className="block text-xs text-white/60" htmlFor="watch-reason">Reason, optional</label>
        <input id="watch-reason" value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2" />
        {error ? <p className="text-xs text-red-200">{error}</p> : null}
        <Button type="submit" disabled={add.isPending}>Add to watchlist</Button>
      </form>
      <div className="mt-3">
        {list.isLoading ? <p className="text-xs text-white/50">Loading watchlist</p> : null}
        {list.isError ? <EmptyState title="Watchlist failed to load" /> : null}
        {list.data && list.data.length === 0 ? <EmptyState title="No data yet" /> : null}
        <ul className="space-y-2">
          {list.data?.map((item) => (
            <li key={item.plate_text} className="flex items-start justify-between gap-2 rounded-lg border border-white/10 px-2 py-2">
              <div>
                <p className="font-mono">{item.plate_text}</p>
                <p className="text-xs text-white/50">{item.note || "No reason"} · {formatIst(item.created_at)}</p>
              </div>
              <Button variant="ghost" onClick={() => remove.mutate(item.plate_text)}>Remove</Button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
