import { CASE_STATUS_COLOR, CASE_STATUS_LABEL } from "../../lib/constants";
import { formatNumber } from "../../lib/format";

const FLOW = ["OPEN", "ESCALATED", "RECOVERED", "STOPPED"];

export default function LiveRecoveryFlow({ cases = [] }) {
  const total = cases.length;
  const counts = FLOW.reduce((acc, status) => {
    acc[status] = cases.filter((c) => c.status === status).length;
    return acc;
  }, {});

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-mist-dark/70 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-obsidian">Live Recovery Flow</div>
          <div className="mt-0.5 text-xs text-obsidian/45">Where every ingested case currently sits</div>
        </div>
        <span className="kicker">{formatNumber(total)} total</span>
      </div>

      <div className="flex items-stretch">
        {FLOW.map((status, i) => {
          const count = counts[status];
          const pct = total ? (count / total) * 100 : 0;
          return (
            <div key={status} className="flex-1 border-r border-mist-dark/70 px-5 py-5 last:border-r-0">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CASE_STATUS_COLOR[status] }} />
                <span className="kicker">{CASE_STATUS_LABEL[status]}</span>
              </div>
              <div className="mono-num mt-2 text-2xl font-semibold text-obsidian">{count}</div>
              <div className="mt-3 h-1 w-full bg-mist">
                <div className="h-1" style={{ width: `${pct}%`, backgroundColor: CASE_STATUS_COLOR[status] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
