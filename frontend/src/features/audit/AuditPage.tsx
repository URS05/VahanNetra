import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listAudit } from "../../api/audit";
import { ApiError } from "../../api/client";
import type { AuditItem } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { csvCell, formatIst } from "../../lib/format";

const PAGE = 12;

export function AuditPage() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: listAudit, retry: false });
  const [role, setRole] = useState("all");
  const [text, setText] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(0);

  const roles = useMemo(() => {
    const set = new Set((audit.data ?? []).map((row) => row.role));
    return ["all", ...set];
  }, [audit.data]);

  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const rows = (audit.data ?? []).filter((row) => {
      if (role !== "all" && row.role !== role) return false;
      if (!needle) return true;
      return `${row.user} ${row.role} ${row.query}`.toLowerCase().includes(needle);
    });
    rows.sort((a, b) => (sort === "desc" ? b.time.localeCompare(a.time) : a.time.localeCompare(b.time)));
    return rows;
  }, [audit.data, role, text, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);

  if (audit.isError && audit.error instanceof ApiError && audit.error.status === 403) {
    return <p className="p-6">Not permitted for your role</p>;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Audit log</h1>
          <p className="text-xs text-white/50">Action, result count and outcome are not returned by GET /api/audit.</p>
        </div>
        <Button variant="ghost" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
          Export CSV
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="text-xs text-white/60">
          Role
          <select
            className="ml-2 rounded-lg border border-white/15 bg-black px-2 py-1"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(0);
            }}
          >
            {roles.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/60">
          Search
          <input
            className="ml-2 rounded-lg border border-white/15 bg-black px-2 py-1"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPage(0);
            }}
            aria-label="Filter audit rows"
          />
        </label>
      </div>
      {audit.isLoading ? <Skeleton className="h-64" /> : null}
      {audit.isError ? <EmptyState title="Could not load the audit log" /> : null}
      {audit.data && filtered.length === 0 ? <EmptyState title="No data yet" /> : null}
      {view.length ? (
        <div className="overflow-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-neutral-950 text-xs uppercase text-white/50">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => setSort((value) => (value === "desc" ? "asc" : "desc"))}>
                    Timestamp ({sort})
                  </button>
                </th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Query</th>
                <th className="px-3 py-2">Result count</th>
                <th className="px-3 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {view.map((row) => (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="px-3 py-2 font-mono text-xs">{formatIst(row.time)}</td>
                  <td className="px-3 py-2">{row.user}</td>
                  <td className="px-3 py-2">{row.role}</td>
                  <td className="px-3 py-2 text-white/40">Not returned by API</td>
                  <td className="px-3 py-2 font-mono">{row.query}</td>
                  <td className="px-3 py-2 text-white/40">Not returned by API</td>
                  <td className="px-3 py-2 text-white/40">Not returned by API</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2 text-sm">
        <Button variant="ghost" disabled={page <= 0} onClick={() => setPage((value) => value - 1)}>Previous</Button>
        <span>{page + 1} / {pages}</span>
        <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
      </div>
    </div>
  );
}

function exportCsv(rows: AuditItem[]) {
  const header = ["timestamp", "user", "role", "query"];
  const body = rows.map((row) => [csvCell(formatIst(row.time)), csvCell(row.user), csvCell(row.role), csvCell(row.query)].join(","));
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "audit.csv";
  link.click();
  URL.revokeObjectURL(url);
}
