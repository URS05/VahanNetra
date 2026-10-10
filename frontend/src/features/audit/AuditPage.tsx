import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listAudit } from "../../api/audit";
import { ApiError } from "../../api/client";
import type { AuditItem } from "../../api/types";
import { csvCell, formatIst } from "../../lib/format";

const PAGE = 10;

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
    return <p className="p-6 text-tac-red font-mono">Not permitted for your role</p>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header matching Tactical Ops Systems */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold uppercase tracking-[0.12em] text-tac-text">
            Systems &amp; Audit Log
          </h1>
          <p className="text-[11px] text-tac-text-dim uppercase tracking-wider mt-0.5">
            System diagnostics and tamper-proof user query log
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportCsv(filtered)}
            disabled={!filtered.length}
            className="tac-btn font-bold py-2.5 px-5 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* System Telemetry KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">Database WAL</div>
            <div className="tac-stat-value text-tac-green text-lg">ONLINE</div>
          </div>
          <div className="text-tac-green text-xl">&#x25C9;</div>
        </div>
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">WebSocket Stream</div>
            <div className="tac-stat-value text-tac-green text-lg">ACTIVE</div>
          </div>
          <div className="text-tac-green text-xl">&#x25CE;</div>
        </div>
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">OSRM Cache</div>
            <div className="tac-stat-value text-tac-accent text-lg">100% CACHED</div>
          </div>
          <div className="text-tac-accent text-xl">&#x26A1;</div>
        </div>
        <div className="tac-stat-card">
          <div>
            <div className="tac-stat-label">Total Audits</div>
            <div className="tac-stat-value text-tac-text">{filtered.length}</div>
          </div>
          <div className="text-tac-text-dim text-xl">&#x2630;</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="tac-search flex-1 max-w-sm">
          <span className="tac-search-icon">&#x1F50D;</span>
          <input
            type="text"
            placeholder="Search audit queries..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-tac-text-dim uppercase tracking-wider">Role:</span>
          <select
            className="bg-tac-surface border border-tac-border text-tac-text text-[11px] px-3 py-2 rounded focus:outline-none focus:border-tac-accent font-mono uppercase"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(0);
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="tac-card rounded-md">
        <div className="text-[12px] uppercase font-bold tracking-[0.15em] text-tac-text-dim mb-4">
          Audit Records
        </div>
        <div className="overflow-x-auto">
          <table className="tac-table w-full">
            <thead>
              <tr className="border-b border-tac-border text-left text-[10px] text-tac-text-muted uppercase tracking-wider">
                <th className="py-3 px-4 font-normal">
                  <button
                    type="button"
                    onClick={() => setSort((v) => (v === "desc" ? "asc" : "desc"))}
                    className="hover:text-tac-accent flex items-center gap-1"
                  >
                    Timestamp ({sort.toUpperCase()})
                  </button>
                </th>
                <th className="py-3 px-4 font-normal">Operative</th>
                <th className="py-3 px-4 font-normal">Role</th>
                <th className="py-3 px-4 font-normal">Query / Search</th>
                <th className="py-3 px-4 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tac-border/40 text-[11px]">
              {view.map((row) => (
                <tr key={row.id} className="hover:bg-tac-surface/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-tac-accent font-semibold">
                    {formatIst(row.time)}
                  </td>
                  <td className="py-3 px-4 font-bold text-tac-text uppercase">{row.user}</td>
                  <td className="py-3 px-4">
                    <span className="bg-zinc-800 text-zinc-300 text-[9px] px-2 py-0.5 rounded font-mono uppercase">
                      {row.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-tac-text">{row.query}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[9px] text-tac-green font-bold bg-green-950/40 border border-green-800/40 px-2 py-0.5 rounded uppercase">
                      LOGGED
                    </span>
                  </td>
                </tr>
              ))}
              {view.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-tac-text-dim font-mono text-xs">
                    No audit records matching query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 pt-3 border-t border-tac-border/60 flex items-center justify-between text-[11px] font-mono">
          <span className="text-tac-text-dim">
            Page {page + 1} of {pages} ({filtered.length} total entries)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 0}
              onClick={() => setPage((p) => p - 1)}
              className="tac-btn-ghost tac-btn py-1 px-3 text-[10px] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="tac-btn-ghost tac-btn py-1 px-3 text-[10px] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportCsv(rows: AuditItem[]) {
  const header = ["timestamp", "user", "role", "query"];
  const body = rows.map((row) =>
    [csvCell(formatIst(row.time)), csvCell(row.user), csvCell(row.role), csvCell(row.query)].join(",")
  );
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "audit.csv";
  link.click();
  URL.revokeObjectURL(url);
}
