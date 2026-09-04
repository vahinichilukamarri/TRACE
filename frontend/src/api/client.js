const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * FastAPI returns 422 `detail` as an ARRAY of validation objects, so passing it
 * straight to Error() rendered as "[object Object]" -- technically not a silent
 * failure, but useless to whoever is looking at it. Flatten it to something a
 * human can act on.
 */
function formatApiError(body, status) {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      const field = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== "body").join(".") : null;
      const msg = d?.msg || JSON.stringify(d);
      return field ? `${field}: ${msg}` : msg;
    });
    return parts.join("; ") || `Request failed (${status})`;
  }
  if (typeof body?.message === "string") return body.message;
  return `Request failed (${status})`;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      /* no json body */
    }
    throw new ApiError(formatApiError(body, res.status), res.status, body);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // ---- Cases ----
  listCases: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    return request(`/cases${q ? `?${q}` : ""}`);
  },
  getCase: (paymentId) => request(`/cases/${encodeURIComponent(paymentId)}`),
  ingestEvent: (event, runFirstIteration = true) =>
    request(`/cases/ingest?run_first_iteration=${runFirstIteration}`, {
      method: "POST",
      body: JSON.stringify(event),
    }),
  reassessCase: (paymentId) =>
    request(`/cases/${encodeURIComponent(paymentId)}/reassess`, { method: "POST" }),
  clickRecoveryLink: (paymentId) =>
    request(`/cases/${encodeURIComponent(paymentId)}/click`, { method: "POST" }),

  // ---- Evaluation ----
  runEvaluation: (payload = { dataset_size: 300 }) =>
    request(`/evaluation/run`, { method: "POST", body: JSON.stringify(payload) }),
  getEvaluationRun: (runId) => request(`/evaluation/runs/${encodeURIComponent(runId)}`),
  listEvaluationRuns: (limit = 20) => request(`/evaluation/runs?limit=${limit}`),

  // ---- Dashboard ----
  getOverview: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    return request(`/dashboard/overview${q ? `?${q}` : ""}`);
  },
  getFailureAnalysis: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    return request(`/dashboard/failures${q ? `?${q}` : ""}`);
  },
  getDecisionsBreakdown: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    return request(`/dashboard/decisions${q ? `?${q}` : ""}`);
  },
  getComparison: (evalRunId) =>
    request(`/dashboard/comparison${evalRunId ? `?eval_run_id=${evalRunId}` : ""}`),
  getFrontier: (evalRunId) =>
    request(`/dashboard/frontier${evalRunId ? `?eval_run_id=${evalRunId}` : ""}`),

  // ---- Policy ----
  getPolicyConfig: () => request(`/policy/config`),
};

export { ApiError, BASE_URL };
