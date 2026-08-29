import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { POLICY_RESULT_COLOR } from "../../lib/constants";

const ICON = {
  APPROVED: ShieldCheck,
  BLOCKED: ShieldX,
  FLAGGED_FOR_REVIEW: ShieldAlert,
};

export default function PolicyCheckPanel({ checks = [] }) {
  if (!checks.length) return null;
  return (
    <div className="panel">
      <div className="border-b border-mist-dark/70 px-5 py-3.5">
        <span className="text-sm font-medium text-obsidian">Policy Check</span>
      </div>
      <div className="divide-y divide-mist-dark/70">
        {checks.map((check, i) => {
          const color = POLICY_RESULT_COLOR[check.result];
          const Icon = ICON[check.result] || ShieldCheck;
          return (
            <div key={i} className="px-5 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={14} strokeWidth={1.75} style={{ color }} />
                  <span className="text-sm font-medium" style={{ color }}>
                    {check.result.replace(/_/g, " ")}
                  </span>
                  <span className="mono-num text-xs text-obsidian/40">→ {check.proposed_action}</span>
                </div>
                {check.final_action && check.final_action !== check.proposed_action && (
                  <span className="kicker">forced: {check.final_action}</span>
                )}
              </div>
              {Array.isArray(check.reasons) && check.reasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {check.reasons.map((r, j) => (
                    <li key={j} className="pl-3 text-xs text-obsidian/55 before:mr-2 before:content-['—']">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
