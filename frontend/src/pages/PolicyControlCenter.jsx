import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, ShieldX, ShieldAlert, ArrowRight } from "lucide-react";
import AppShell from "../components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "../components/common/States";
import { useEvalRun } from "../lib/EvalRunContext";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
import { SIGNAL, ACTION_LABEL } from "../lib/constants";

// Mirrors the defaults in backend/.env.example — the API does not currently
// expose a live settings endpoint, so these are shown as configured
// reference values, not live-fetched data.
const POLICY_RULES = [
  { label: "Maximum Recovery Attempts", value: "3", note: "per case, across all actions" },
  { label: "Recovery Window", value: "4,320 min (3 days)", note: "from first failure to forced stop" },
  { label: "Max Same-Action Repeats", value: "1", note: "never hammer the same action indefinitely" },
  { label: "High-Value Threshold", value: "₹50,000", note: "requires review before auto-closing" },
  { label: "Policy Confidence Floor", value: "0.40", note: "below this → flagged for review, not autonomy" },
  { label: "Reassessment Iteration Bound", value: "4", note: "hard cap — never an unbounded loop" },
];

const ALLOWED_ACTIONS = [
  "RETRY_PAYMENT",
  "SEND_RECOVERY_LINK",
  "SUGGEST_ALTERNATIVE_METHOD",
  "WAIT_AND_REASSESS",
  "ESCALATE_FOR_REVIEW",
  "STOP_RECOVERY",
];

const FLOW_STEPS = [
  { key: "request", label: "TRACE Request", color: SIGNAL.orange },
  { key: "check", label: "Policy Check", color: "#111111" },
  { key: "result", label: "Approved / Blocked / Review", color: null },
  { key: "exec", label: "Execution", color: "#111111" },
];

export default function PolicyControlCenter() {
  const { selectedRunId, loading: runsLoading } = useEvalRun();
  const [decisions, setDecisions] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!selectedRunId) return;
    setError(null);
    try {
      const d = await api.decisions({ eval_run_id: selectedRunId, system: "TRACE" });
      setDecisions(d);
    } catch (e) {
      setError(e);
    }
  }, [selectedRunId]);

  useEffect(() => {
    load();
  }, [load]);

  const policyCounts = { APPROVED: 0, BLOCKED: 0, FLAGGED_FOR_REVIEW: 0 };
  decisions?.policy_results?.forEach((p) => {
    policyCounts[p.result] = p.count;
  });
  const totalChecks = Object.values(policyCounts).reduce((a, b) => a + b, 0);

  return (
    <AppShell title="Policy Control Center" subtitle="Agent decides. Policy controls. — 100% deterministic, zero LLM dependency">
      <div className="space-y-8">
        {/* Flow diagram */}
        <div className="panel px-8 py-8">
          <div className="kicker mb-6">Control Flow</div>
          <div className="flex items-center justify-between">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.key} className="flex flex-1 items-center">
                <div className="flex flex-1 flex-col items-center gap-2 text-center">
                  {step.key === "result" ? (
                    <div className="flex gap-4">
                      <MiniShield icon={ShieldCheck} color={SIGNAL.mint} label="Approved" />
                      <MiniShield icon={ShieldX} color={SIGNAL.red} label="Blocked" />
                      <MiniShield icon={ShieldAlert} color={SIGNAL.amber} label="Review" />
                    </div>
                  ) : (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center border-2" style={{ borderColor: step.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} />
                      </div>
                      <span className="text-xs font-medium text-obsidian">{step.label}</span>
                    </>
                  )}
                </div>
                {i < FLOW_STEPS.length - 1 && <ArrowRight size={16} className="mx-2 shrink-0 text-obsidian/25" />}
              </div>
            ))}
          </div>
        </div>

        {/* Policy thresholds */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-obsidian">Configured Guardrails</h2>
          <div className="panel grid grid-cols-1 divide-y divide-mist-dark/70 md:grid-cols-2 md:divide-y-0">
            {POLICY_RULES.map((rule, i) => (
              <div key={rule.label} className={`px-5 py-4 ${i % 2 === 0 ? "md:border-r md:border-mist-dark/70" : ""} ${i < POLICY_RULES.length - 2 ? "md:border-b md:border-mist-dark/70" : ""}`}>
                <div className="kicker">{rule.label}</div>
                <div className="mono-num mt-1 text-lg font-semibold text-obsidian">{rule.value}</div>
                <div className="mt-0.5 text-xs text-obsidian/45">{rule.note}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-obsidian/35">Reference values from backend configuration — adjust via .env.</p>
        </div>

        {/* Allowed action space */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-obsidian">Bounded Action Space</h2>
          <p className="mb-3 text-xs text-obsidian/45">TRACE can never select an action outside this fixed set — no free-form behavior.</p>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_ACTIONS.map((a) => (
              <span key={a} className="border border-mist-dark px-3 py-1.5 font-mono text-xs text-obsidian/75">
                {ACTION_LABEL[a]}
              </span>
            ))}
          </div>
        </div>

        {/* Live policy outcomes for the selected evaluation run */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-obsidian">Policy Outcomes — Selected Evaluation Run</h2>
          {runsLoading && <LoadingState label="Loading runs" />}
          {!runsLoading && !selectedRunId && <EmptyState label="No evaluation run yet" detail="Run an evaluation from the top bar to see live policy check outcomes." />}
          {error && <ErrorState message="Could not load policy outcomes" detail={error.message} onRetry={load} />}
          {selectedRunId && !error && !decisions && <LoadingState label="Loading policy checks" />}

          {decisions && totalChecks > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <PolicyStat icon={ShieldCheck} color={SIGNAL.mint} label="Approved" count={policyCounts.APPROVED} total={totalChecks} />
              <PolicyStat icon={ShieldAlert} color={SIGNAL.amber} label="Flagged for Review" count={policyCounts.FLAGGED_FOR_REVIEW} total={totalChecks} />
              <PolicyStat icon={ShieldX} color={SIGNAL.red} label="Blocked" count={policyCounts.BLOCKED} total={totalChecks} />
            </div>
          )}
          {decisions && totalChecks === 0 && <EmptyState label="No policy checks recorded for this run" />}
        </div>
      </div>
    </AppShell>
  );
}

function MiniShield({ icon: Icon, color, label }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-9 w-9 items-center justify-center border-2" style={{ borderColor: color }}>
        <Icon size={14} style={{ color }} strokeWidth={2} />
      </div>
      <span className="text-[10px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function PolicyStat({ icon: Icon, color, label, count, total }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div className="border border-mist-dark/70 px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color }} strokeWidth={1.75} />
        <span className="kicker">{label}</span>
      </div>
      <div className="mono-num mt-2 text-2xl font-semibold" style={{ color }}>
        {formatNumber(count)}
      </div>
      <div className="mt-2 h-1 w-full bg-mist">
        <div className="h-1" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1.5 text-[11px] text-obsidian/40">{pct.toFixed(1)}% of checks</div>
    </div>
  );
}
