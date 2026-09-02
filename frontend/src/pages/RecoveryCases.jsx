import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/Page";
import { CaseCard } from "@/components/CaseCard";
import { RunSelector } from "@/components/RunSelector";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { CASE_STATUS_LABELS } from "@/lib/domain";

const STATUS_FILTERS = ["ALL", "OPEN", "RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];
const PAGE_SIZE = 20;

export default function RecoveryCases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "ALL";
  const [page, setPage] = useState(0);
  // Default to individually-ingested demo cases: that's what you click through
  // in a live demo, and it doesn't shift under you when a new batch is run.
  // An explicit ?eval_run_id= in the URL wins, so deep links from the Command
  // Center land on the run they were talking about instead of the live queue.
  const [selectedScope, setSelectedScope] = useState(
    () => searchParams.get("eval_run_id") || "live"
  );

  const fetcher = useCallback(
    () =>
      selectedScope === "live"
        ? api.listCases({
            status: status === "ALL" ? undefined : status,
            source: "live",
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          })
        : api.listCases({
            status: status === "ALL" ? undefined : status,
            system: "TRACE",
            eval_run_id: selectedScope,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          }),
    [status, page, selectedScope]
  );
  const { data: cases, loading, error, refresh } = useApi(fetcher, [status, page, selectedScope]);

  const setScope = (s) => {
    setPage(0);
    setSelectedScope(s);
    // Keep the URL honest about what's being shown so the view is shareable
    // and a refresh doesn't silently snap back to the live queue.
    const next = new URLSearchParams(searchParams);
    if (s === "live") {
      next.delete("eval_run_id");
    } else {
      next.set("eval_run_id", s);
    }
    setSearchParams(next, { replace: true });
  };

  const setStatus = (s) => {
    setPage(0);
    // Build a fresh URLSearchParams instead of mutating the one from
    // useSearchParams -- mutating that shared instance and passing it back
    // makes React Router miss the change, so filter clicks don't re-render.
    const next = new URLSearchParams(searchParams);
    if (s === "ALL") {
      next.delete("status");
    } else {
      next.set("status", s);
    }
    setSearchParams(next, { replace: true });
  };

  const counts = useMemo(() => cases?.length ?? 0, [cases]);

  return (
    <div>
      <PageHeader
        eyebrow="Recovery cases"
        title="Recovery intelligence queue"
        description="Every failed payment TRACE is tracking, why it matters, and what happens next."
        action={
          <RunSelector value={selectedScope} onChange={setScope} includeLiveOption={true} />
        }
      />

      <div className="px-8 py-6">
        <div className="flex items-center gap-1 mb-6 border-b border-obsidian-line pb-3">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wide transition-colors ${
                status === s
                  ? "bg-signal-orange text-obsidian font-medium"
                  : "text-ink-faint hover:text-bone"
              }`}
            >
              {s === "ALL" ? "All" : CASE_STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        {loading && <LoadingState label="Loading cases" />}
        {error && <ErrorState description={error.message} onRetry={refresh} />}

        {cases && cases.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="No cases in this view"
            description="Try a different status filter, or run an evaluation from the Command Center to generate a batch of cases."
          />
        )}

        {cases && cases.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cases.map((c) => (
                <CaseCard key={c.payment_id} caseData={c} />
              ))}
            </div>

            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-xs font-mono uppercase tracking-wide text-ink-faint disabled:opacity-30 hover:text-bone"
              >
                ← Previous
              </button>
              <span className="text-[11px] font-mono text-ink-faint">Page {page + 1}</span>
              <button
                onClick={() => setPage((p) => (counts < PAGE_SIZE ? p : p + 1))}
                disabled={counts < PAGE_SIZE}
                className="text-xs font-mono uppercase tracking-wide text-ink-faint disabled:opacity-30 hover:text-bone"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
