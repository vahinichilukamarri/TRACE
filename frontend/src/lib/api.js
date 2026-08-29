const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail;
    } catch {
      detail = await res.text().catch(() => "");
    }
    const err = new Error(detail || `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const qs = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
};

export const api = {
  // cases
  listCases: (params = {}) => request(`/cases${qs(params)}`),
  getCase: (paymentId) => request(`/cases/${paymentId}`),
  ingest: (payload) => request(`/cases/ingest`, { method: "POST", body: JSON.stringify(payload) }),
  reassess: (paymentId) => request(`/cases/${paymentId}/reassess`, { method: "POST" }),
  click: (paymentId) => request(`/cases/${paymentId}/click`, { method: "POST" }),

  // evaluation
  runEvaluation: (payload = { dataset_size: 300 }) =>
    request(`/evaluation/run`, { method: "POST", body: JSON.stringify(payload) }),
  getRun: (runId) => request(`/evaluation/runs/${runId}`),
  listRuns: (limit = 20) => request(`/evaluation/runs${qs({ limit })}`),

  // dashboard
  overview: (params = {}) => request(`/dashboard/overview${qs(params)}`),
  failures: (params = {}) => request(`/dashboard/failures${qs(params)}`),
  decisions: (params = {}) => request(`/dashboard/decisions${qs(params)}`),
  comparison: (params = {}) => request(`/dashboard/comparison${qs(params)}`),

  health: () => request(`/health`),
};

export { BASE_URL };
