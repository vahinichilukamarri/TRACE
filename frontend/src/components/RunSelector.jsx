import { useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";

/**
 * Dropdown to pick which evaluation run's data to view. Defaults to the
 * most recent run once runs load, unless a value is already controlled
 * by the parent. Pass includeLiveOption to add a "Live cases only" entry
 * (value "live") for pages that also show individually-ingested demo
 * cases outside any batch run.
 *
 * The run list is fetched in here, so a parent that creates a new run has no
 * other way to tell this component the list is stale -- bump `refreshToken`
 * and it refetches. Without it the dropdown only picked up a new batch when
 * the page remounted on navigation.
 */
export function RunSelector({ value, onChange, includeLiveOption = false, refreshToken = 0 }) {
  const fetcher = useCallback(() => api.listEvaluationRuns(20), []);
  const { data: runs, loading } = useApi(fetcher, [refreshToken]);

  if (loading) {
    return <div className="eyebrow text-cream-dim">/ loading runs…</div>;
  }
  if (!runs || runs.length === 0) {
    return <div className="eyebrow text-cream-dim">/ no evaluation runs yet</div>;
  }

  return (
    <label className="group inline-flex min-w-0 max-w-full items-center gap-2.5 rounded-xs border border-void-line bg-void-soft py-1.5 pl-3 pr-2 transition-colors focus-within:border-electric hover:border-cream/25">
      <span className="eyebrow shrink-0 text-cream-dim">/ run</span>

      {/* The native select carries the value; the chevron is ours because the
          platform arrow cannot be styled and reads as a different product. */}
      <span className="relative flex min-w-0 items-center">
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Evaluation run"
          className="tnum w-full min-w-0 max-w-[22rem] cursor-pointer appearance-none truncate bg-transparent pr-5 text-xs text-cream outline-none"
        >
          {includeLiveOption && (
            <option value="live" className="bg-void text-cream">
              Live cases only
            </option>
          )}
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id} className="bg-void text-cream">
              {formatDateTime(r.created_at)} — {r.dataset_size} cases ({r.run_id.slice(0, 8)})
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-0 h-3.5 w-3.5 shrink-0 text-cream-dim"
          strokeWidth={1.75}
        />
      </span>
    </label>
  );
}
