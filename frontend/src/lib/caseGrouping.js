/**
 * The case detail endpoint returns four separate lists (decisions, policy_checks,
 * executions, outcomes). Every iteration of TRACE's loop produces exactly one
 * decision and exactly one policy check (guaranteed 1:1 by app/engine.py), but
 * execution/outcome are only produced when the policy check actually clears an
 * action -- so those lists can be shorter than decisions. This groups all four
 * into ordered "rounds" (one per reassessment pass) using iteration order and
 * timestamp windows, so the UI can show what happened together without
 * pretending we know something the data doesn't guarantee.
 */
export function groupCaseIterations(caseDetail) {
  if (!caseDetail) return [];

  const decisions = [...(caseDetail.decisions || [])].sort(
    (a, b) => a.iteration - b.iteration || new Date(a.created_at) - new Date(b.created_at)
  );
  const policyChecks = [...(caseDetail.policy_checks || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const executions = [...(caseDetail.executions || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const outcomes = [...(caseDetail.outcomes || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  return decisions.map((decision, i) => {
    const policy = policyChecks[i] || null;
    const windowStart = policy ? new Date(policy.created_at).getTime() : new Date(decision.created_at).getTime();
    const nextDecision = decisions[i + 1];
    const windowEnd = nextDecision ? new Date(nextDecision.created_at).getTime() : Infinity;

    const execution =
      executions.find((e) => {
        const t = new Date(e.created_at).getTime();
        return t >= windowStart && t < windowEnd;
      }) || null;
    const outcome =
      outcomes.find((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= windowStart && t < windowEnd;
      }) || null;

    return { iteration: decision.iteration, decision, policy, execution, outcome };
  });
}
