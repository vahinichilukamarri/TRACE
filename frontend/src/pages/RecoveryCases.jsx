import { useEffect, useState, useCallback } from "react";
import AppShell from "../components/shell/AppShell";
import CaseRow from "../components/cases/CaseRow";
import { LoadingState, ErrorState, EmptyState } from "../components/common/States";
import { api } from "../lib/api";

const STATUS_FILTERS = ["ALL", "OPEN", "ESCALATED", "RECOVERED", "STOPPED", "EXPIRED"];
const PAGE_SIZE = 20;

export default function RecoveryCases() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("ALL");
  const [offset, setOffset] = useState(0);
  const [details, setDetails] = useState({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.listCases({
        status: status === "ALL" ? undefined : status,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(data);

      // fetch decision detail for the visible page only — keeps this cheap
      const entries = await Promise.all(
        data.map(async (c) => {
          try {
            const d = await api.getCase(c.payment_id);
            return [c.payment_id, d.decisions?.[d.decisions.length - 1] || null];
          } catch {
            return [c.payment_id, null];
          }
        })
      );
      setDetails(Object.fromEntries(entries));
    } catch (e) {
      setError(e);
    }
  }, [status, offset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell title="Recovery Cases" subtitle="Every case TRACE is tracking, ranked by why it matters">
      <div className="mb-5 flex items-center gap-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setOffset(0);
            }}
            className={`border px-3 py-1.5 text-xs font-medium transition-colors ${
              status === s
                ? "border-obsidian bg-obsidian text-bone"
                : "border-mist-dark text-obsidian/60 hover:border-obsidian hover:text-obsidian"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <ErrorState message="Could not load cases" detail={error.message} onRetry={load} />}
      {!error && items === null && <LoadingState label="Loading recovery cases" />}
      {!error && items && items.length === 0 && (
        <EmptyState label="No cases match this filter" detail="Try a different status, or ingest a new payment-failure event." />
      )}

      {!error && items && items.length > 0 && (
        <div className="panel">
          <div className="grid grid-cols-12 gap-3 border-b border-mist-dark bg-mist/30 px-5 py-2.5">
            {["Pri", "Payment ID", "Amount", "Failure", "Attempts", "TRACE Decision", "Status", ""].map((h, i) => (
              <div
                key={h + i}
                className={`kicker ${[1, 2, 6].includes(i) ? "" : "text-center"} ${
                  ["col-span-1", "col-span-2", "col-span-1", "col-span-2", "col-span-1", "col-span-2", "col-span-2", "col-span-1"][i]
                }`}
              >
                {h}
              </div>
            ))}
          </div>
          {items.map((item) => (
            <CaseRow
              key={item.payment_id}
              item={item}
              latestDecision={details[item.payment_id]}
              loadingDetail={!(item.payment_id in details)}
            />
          ))}
        </div>
      )}

      {!error && items && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-obsidian/40">
            Showing {items.length ? offset + 1 : 0}–{offset + items.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
              className="btn-ghost !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={items.length < PAGE_SIZE}
              className="btn-ghost !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
