import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox, PlusCircle } from "lucide-react";
import { Button } from "@/components/Button";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/Page";
import { StatusPill } from "@/components/StatusIndicator";
import { RecoveryTraceLine } from "@/components/RecoveryTraceLine";
import { RunSelector } from "@/components/RunSelector";
import { SimulateFailureDialog } from "@/components/SimulateFailureDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { deriveTraceStageSummary } from "@/lib/caseStage";
import { CASE_STATUS_LABELS, FAILURE_LABELS, STATUS_SIGNAL } from "@/lib/domain";
import { formatCurrency, formatRelative } from "@/lib/format";

/*
 * The queue as a register: one cream document, one line per case, columns that
 * hold their position down the page so the eye can run the amount column or the
 * status column without reading anything else.
 */

const STATUS_FILTERS = ["ALL", "OPEN", "RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];
const PAGE_SIZE = 20;

// Six columns on a wide desk. Below lg the row folds into a stacked record:
// the same cells, reordered so the status and the amount lead and the rest
// settles underneath. Order utilities do the folding, so every value appears
// exactly once in the markup.
const COLS =
  "grid-cols-2 lg:grid-cols-[7.5rem_minmax(0,1fr)_8.5rem_9rem_7.5rem_6rem]";

function QueueHead() {
  return (
    <div
      className={`rule-double hidden ${COLS} items-baseline gap-x-5 border-b-0 px-4 pb-2 pt-3 sm:px-6 lg:grid`}
    >
      <div className="eyebrow text-graphite/60">status</div>
      <div className="eyebrow text-graphite/60">payment</div>
      <div className="eyebrow text-right text-graphite/60">amount</div>
      <div className="eyebrow text-graphite/60">failure</div>
      <div className="eyebrow text-graphite/60">classifier</div>
      <div className="eyebrow text-graphite/60">updated</div>
    </div>
  );
}

function QueueRow({ caseData }) {
  const { activeIndex, finalSignal } = deriveTraceStageSummary(caseData);
  return (
    <Link
      to={`/cases/${encodeURIComponent(caseData.payment_id)}`}
      className={`grid ${COLS} items-center gap-x-5 gap-y-2 border-b border-rule px-4 py-3 transition-colors last:border-b-0 hover:bg-paper-alt sm:px-6`}
    >
      <div className="order-1 min-w-0">
        <StatusPill signal={STATUS_SIGNAL[caseData.status] || "neutral"}>
          {CASE_STATUS_LABELS[caseData.status] || caseData.status}
        </StatusPill>
      </div>

      <div className="tnum wrap-id order-2 text-right text-base font-semibold text-graphite lg:order-3">
        {formatCurrency(caseData.amount, caseData.currency)}
      </div>

      <div className="order-3 col-span-2 min-w-0 lg:order-2 lg:col-span-1">
        {/* Payment IDs have no spaces to break on, so they get character
            wrapping rather than a width they can push past. */}
        <div className="tnum wrap-id text-xs font-medium text-graphite">
          {caseData.payment_id}
        </div>
        <div className="mt-1.5 max-w-40">
          <RecoveryTraceLine activeIndex={activeIndex} finalSignal={finalSignal} compact />
        </div>
      </div>

      <div className="order-4 min-w-0 text-xs text-graphite/70">
        {FAILURE_LABELS[caseData.failure_type] || caseData.failure_type || "Unclassified"}
      </div>

      <div className="tnum order-5 min-w-0 text-right text-[11px] text-graphite/70 lg:text-left">
        {caseData.classification_method || "—"}
      </div>

      <div className="tnum order-6 col-span-2 text-[11px] text-graphite/70 lg:col-span-1">
        {formatRelative(caseData.updated_at)}
      </div>
    </Link>
  );
}

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
  const [simulateOpen, setSimulateOpen] = useState(false);

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
          <div className="flex flex-wrap items-center gap-2">
            <RunSelector value={selectedScope} onChange={setScope} includeLiveOption={true} />
            <Button onClick={() => setSimulateOpen(true)}>
              <PlusCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              Simulate failed payment
            </Button>
          </div>
        }
      />

      <div className="px-6 py-6 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-void-line pb-3">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`eyebrow rounded-xs px-3 py-1.5 transition-colors ${
                status === s
                  ? "bg-electric text-white"
                  : "text-cream-dim hover:bg-cream/5 hover:text-cream"
              }`}
            >
              {s === "ALL" ? "All" : CASE_STATUS_LABELS[s] || s}
            </button>
          ))}
          {/* Its own line on a phone: sitting inline after the last filter it
              read as one more filter rather than as a label for the view. */}
          <span className="eyebrow basis-full pt-1 text-cream-dim sm:ml-auto sm:basis-auto sm:pt-0">
            {selectedScope === "live" ? "/ live queue" : "/ evaluation batch"}
          </span>
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
            <div className="record overflow-hidden pb-1">
              <QueueHead />
              {cases.map((c) => (
                <QueueRow key={c.payment_id} caseData={c} />
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="eyebrow text-cream-dim transition-colors hover:text-cream disabled:opacity-40 disabled:hover:text-cream-dim"
              >
                ← Previous
              </button>
              <span className="tnum text-[11px] text-cream-dim">
                Page {page + 1} · {counts} case{counts === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => setPage((p) => (counts < PAGE_SIZE ? p : p + 1))}
                disabled={counts < PAGE_SIZE}
                className="eyebrow text-cream-dim transition-colors hover:text-cream disabled:opacity-40 disabled:hover:text-cream-dim"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>

      {simulateOpen && <SimulateFailureDialog onClose={() => setSimulateOpen(false)} />}
    </div>
  );
}
