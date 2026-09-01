import { useCallback } from "react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";

/**
 * Dropdown to pick which evaluation run's data to view. Defaults to the
 * most recent run once runs load, unless a value is already controlled
 * by the parent. Pass includeLiveOption to add a "Live cases only" entry
 * (value "live") for pages that also show individually-ingested demo
 * cases outside any batch run.
 */
export function RunSelector({ value, onChange, includeLiveOption = false }) {
  const fetcher = useCallback(() => api.listEvaluationRuns(20), []);
  const { data: runs, loading } = useApi(fetcher, []);

  if (loading) {
    return <div className="text-xs font-mono text-ink-faint">Loading runs…</div>;
  }
  if (!runs || runs.length === 0) {
    return <div className="text-xs font-mono text-ink-faint">No evaluation runs yet</div>;
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="bg-obsidian-soft border border-obsidian-line text-xs font-mono text-bone px-3 py-1.5 outline-none focus:border-signal-orange"
    >
      {includeLiveOption && <option value="live">Live cases only</option>}
      {runs.map((r) => (
        <option key={r.run_id} value={r.run_id}>
          {formatDateTime(r.created_at)} — {r.dataset_size} cases ({r.run_id.slice(0, 8)})
        </option>
      ))}
    </select>
  );
}
