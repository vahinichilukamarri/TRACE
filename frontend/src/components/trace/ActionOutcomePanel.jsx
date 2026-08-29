import { Zap, CheckCircle2, XCircle, Clock, MinusCircle } from "lucide-react";
import { ACTION_LABEL, EXECUTION_TYPE_COLOR, OUTCOME_COLOR } from "../../lib/constants";
import { formatINR, formatTime } from "../../lib/format";

const OUTCOME_ICON = {
  RECOVERED: CheckCircle2,
  NOT_RECOVERED: XCircle,
  PENDING: Clock,
  NOT_APPLICABLE: MinusCircle,
};

export default function ActionOutcomePanel({ executions = [], outcomes = [] }) {
  if (!executions.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="panel">
        <div className="flex items-center gap-2 border-b border-mist-dark/70 px-5 py-3.5">
          <Zap size={14} strokeWidth={1.75} className="text-signal-orange" />
          <span className="text-sm font-medium text-obsidian">Action</span>
        </div>
        <div className="divide-y divide-mist-dark/70">
          {executions.map((e, i) => (
            <div key={i} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-obsidian">{ACTION_LABEL[e.action] || e.action}</span>
                <span
                  className="label-micro !text-[10px]"
                  style={{ color: EXECUTION_TYPE_COLOR[e.execution_type] }}
                >
                  {e.execution_type}
                </span>
              </div>
              <div className="mt-1 text-xs text-obsidian/45">{e.status}</div>
              <div className="mono-num mt-0.5 text-[11px] text-obsidian/35">{formatTime(e.created_at)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center gap-2 border-b border-mist-dark/70 px-5 py-3.5">
          <CheckCircle2 size={14} strokeWidth={1.75} className="text-obsidian/60" />
          <span className="text-sm font-medium text-obsidian">Outcome</span>
        </div>
        <div className="divide-y divide-mist-dark/70">
          {outcomes.length === 0 && <div className="px-5 py-4 text-xs text-obsidian/40">Pending resolution.</div>}
          {outcomes.map((o, i) => {
            const Icon = OUTCOME_ICON[o.outcome] || MinusCircle;
            const color = OUTCOME_COLOR[o.outcome];
            return (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon size={13} strokeWidth={1.75} style={{ color }} />
                    <span className="text-sm font-medium" style={{ color }}>
                      {o.outcome.replace(/_/g, " ")}
                    </span>
                  </div>
                  {o.simulated && <span className="label-micro !text-[10px]">simulated</span>}
                </div>
                {o.revenue_recovered != null && (
                  <div className="mono-num mt-1 text-sm font-medium text-obsidian">{formatINR(o.revenue_recovered)}</div>
                )}
                <div className="mono-num mt-0.5 text-[11px] text-obsidian/35">{formatTime(o.created_at)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
