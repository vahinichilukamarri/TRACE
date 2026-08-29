import { Brain } from "lucide-react";
import { ACTION_LABEL, SIGNAL } from "../../lib/constants";

export default function ReasoningPanel({ decision }) {
  if (!decision) return null;
  const pct = Math.round((decision.confidence ?? 0) * 100);

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-mist-dark/70 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Brain size={14} strokeWidth={1.75} className="text-signal-orange" />
          <span className="text-sm font-medium text-obsidian">TRACE Reasoning</span>
        </div>
        <span className="kicker">
          {decision.agent_mode} {decision.is_fallback ? "· fallback" : ""} · iteration {decision.iteration}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-sm leading-relaxed text-obsidian/80">{decision.reasoning}</p>

        <div className="flex items-center gap-6">
          <div>
            <div className="label-micro">Decision</div>
            <div className="mt-1 text-sm font-medium text-obsidian">
              {decision.decision === "RECOVERY_WORTH_PURSUING" ? "Worth Pursuing" : "Not Worth Pursuing"}
            </div>
          </div>
          <div>
            <div className="label-micro">Selected Action</div>
            <div className="mt-1 text-sm font-medium" style={{ color: SIGNAL.orange }}>
              {ACTION_LABEL[decision.action] || decision.action}
            </div>
          </div>
          <div>
            <div className="label-micro">Confidence</div>
            <div className="mono-num mt-1 flex items-center gap-2 text-sm font-medium text-obsidian">
              {pct}%
              <span className="h-1 w-16 bg-mist-dark">
                <span
                  className="block h-1"
                  style={{ width: `${pct}%`, backgroundColor: pct < 50 ? SIGNAL.amber : SIGNAL.orange }}
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
