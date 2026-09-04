import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Zap, RotateCw, AlertTriangle, Mail } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "./Button";
import { FAILURE_LABELS } from "@/lib/domain";

const FAILURE_CODES = [
  "CARD_DECLINED",
  "AUTH_FAILURE",
  "BANK_TIMEOUT",
  "INSUFFICIENT_FUNDS",
  "PROCESSING_ERROR",
];
const FREE_TEXT = "__FREE_TEXT__";

/** Ingest is idempotent by payment_id, so a reused id returns duplicate:true and
 *  renders no decision at all. Always hand the demo a fresh one. */
function newPaymentId() {
  return `LIVE_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

const BASE = {
  amount: 7400,
  failureMode: "CARD_DECLINED",
  failureMessage: "",
  customerSuccessRate: 0.82,
  previousRecoveryAttempts: 0,
  previousRecoveryAction: null,
  previousOutcome: null,
  remainingRecoveryOpportunities: 3,
  timeSinceFailureMinutes: 12,
  customerEmail: "",
};

// Each preset is a scenario that reliably exercises one specific behaviour
// end to end. These matter more than the form on camera.
const PRESETS = [
  {
    key: "standard",
    label: "Standard decline",
    hint: "HEURISTIC on pass 0, routes to LLM on pass 1",
    values: { ...BASE },
  },
  {
    key: "high-value",
    label: "High-value, prior attempt failed",
    hint: "Routes to LLM immediately (high-value trigger)",
    values: {
      ...BASE,
      amount: 95000,
      failureMode: "AUTH_FAILURE",
      customerSuccessRate: 0.7,
      previousRecoveryAttempts: 1,
      previousRecoveryAction: "SEND_RECOVERY_LINK",
      previousOutcome: "FAILED",
    },
  },
  {
    key: "free-text",
    label: "Ambiguous free-text failure",
    hint: "Exercises live LLM classification",
    values: {
      ...BASE,
      amount: 22000,
      failureMode: FREE_TEXT,
      failureMessage:
        "Transaction could not be completed due to a temporary restriction at the issuer's end.",
    },
  },
  {
    key: "expired",
    label: "Expired bank timeout",
    hint: "Policy force-stops it past the NPCI window",
    values: {
      ...BASE,
      amount: 15000,
      failureMode: "BANK_TIMEOUT",
      timeSinceFailureMinutes: 2000,
    },
  },
];

const LABEL = "block text-[10px] font-mono uppercase tracking-[0.1em] text-ink-faint mb-1.5";
const FIELD =
  "w-full bg-obsidian border border-obsidian-line px-2.5 py-1.5 text-sm text-bone " +
  "mono-tabular outline-none focus:border-signal-orange placeholder:text-ink-faint";

export function SimulateFailureDialog({ onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({ ...BASE, paymentId: newPaymentId() }));
  const [activePreset, setActivePreset] = useState("standard");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateOf, setDuplicateOf] = useState(null);
  const panelRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    setError(null);
    setDuplicateOf(null);
    // Fresh id every time: re-running a preset mid-demo must never collide.
    setForm({ ...preset.values, paymentId: newPaymentId() });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = useCallback(
    async (event) => {
      event.preventDefault();
      setError(null);
      setDuplicateOf(null);

      // Never submit a blank id. Generate rather than block, so the demo can
      // never stall on a validation message.
      const paymentId = form.paymentId.trim() || newPaymentId();
      if (paymentId !== form.paymentId) setForm((f) => ({ ...f, paymentId }));

      const isFreeText = form.failureMode === FREE_TEXT;
      const payload = {
        payment_id: paymentId,
        amount: Number(form.amount),
        currency: "INR",
        failure_code: isFreeText ? null : form.failureMode,
        failure_message: isFreeText ? form.failureMessage.trim() || null : null,
        customer_success_rate: Number(form.customerSuccessRate),
        previous_recovery_attempts: Number(form.previousRecoveryAttempts),
        previous_recovery_action: form.previousRecoveryAction,
        previous_outcome: form.previousOutcome,
        remaining_recovery_opportunities: Number(form.remainingRecoveryOpportunities),
        time_since_failure_minutes: Number(form.timeSinceFailureMinutes),
        source: "live",
      };
      if (form.customerEmail.trim()) payload.customer_email = form.customerEmail.trim();

      setSubmitting(true);
      try {
        const result = await api.ingestEvent(payload);
        // A 200 with duplicate:true carries null decision/policy. That is not
        // a success and must never be rendered as one.
        if (result?.duplicate) {
          setDuplicateOf(result.payment_id || paymentId);
          return;
        }
        onClose();
        navigate(`/cases/${encodeURIComponent(paymentId)}`);
      } catch (err) {
        setError(
          err?.message ||
            "Could not reach the TRACE backend. Check that it is running and try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [form, navigate, onClose]
  );

  const isFreeText = form.failureMode === FREE_TEXT;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-obsidian/80 p-6"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl border border-obsidian-line bg-obsidian-soft my-4"
        role="dialog"
        aria-modal="true"
        aria-label="Simulate failed payment"
      >
        <div className="flex items-start justify-between border-b border-obsidian-line px-5 py-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-signal-orange mb-1">
              Live ingest
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-bone">
              Simulate failed payment
            </h2>
            <p className="mt-1 max-w-md text-xs text-ink-faint">
              Pushes one real payment-failure event through the full TRACE loop, then opens the
              case so the decision, guardrails and routing are on screen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-faint transition-colors hover:text-bone"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-5">
          <div>
            <div className={LABEL}>Demo presets</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => {
                const active = activePreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-signal-orange bg-signal-orange-dim/10"
                        : "border-obsidian-line hover:border-signal-orange/50"
                    }`}
                  >
                    <div
                      className={`text-xs font-medium ${
                        active ? "text-signal-orange" : "text-bone"
                      }`}
                    >
                      {preset.label}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-ink-faint">
                      {preset.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="sim-payment-id">
              Payment ID
            </label>
            <div className="flex gap-2">
              <input
                id="sim-payment-id"
                className={FIELD}
                value={form.paymentId}
                onChange={(e) => set({ paymentId: e.target.value })}
                onBlur={() => {
                  if (!form.paymentId.trim()) set({ paymentId: newPaymentId() });
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => set({ paymentId: newPaymentId() })}
                title="Generate a new ID"
              >
                <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-ink-faint">
              Auto-generated. Ingest is idempotent by payment ID, so reusing one returns the
              existing case instead of running a new decision.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="sim-amount">
                Amount (INR)
              </label>
              <input
                id="sim-amount"
                type="number"
                min="1"
                step="1"
                className={FIELD}
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="sim-failure">
                Failure
              </label>
              <select
                id="sim-failure"
                className={FIELD}
                value={form.failureMode}
                onChange={(e) => set({ failureMode: e.target.value })}
              >
                {FAILURE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {FAILURE_LABELS[code] || code}
                  </option>
                ))}
                <option value={FREE_TEXT}>Free text instead...</option>
              </select>
            </div>
          </div>

          {isFreeText && (
            <div>
              <label className={LABEL} htmlFor="sim-message">
                Failure message (classified live)
              </label>
              <textarea
                id="sim-message"
                rows={2}
                className={`${FIELD} font-sans`}
                placeholder="Describe the failure in plain language"
                value={form.failureMessage}
                onChange={(e) => set({ failureMessage: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className={LABEL} htmlFor="sim-csr">
              Customer success rate
              <span className="ml-2 text-signal-orange">
                {Math.round(form.customerSuccessRate * 100)}%
              </span>
            </label>
            <input
              id="sim-csr"
              type="range"
              min="0"
              max="1"
              step="0.01"
              className="w-full accent-signal-orange"
              value={form.customerSuccessRate}
              onChange={(e) => set({ customerSuccessRate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL} htmlFor="sim-attempts">
                Prior attempts
              </label>
              <input
                id="sim-attempts"
                type="number"
                min="0"
                max="10"
                className={FIELD}
                value={form.previousRecoveryAttempts}
                onChange={(e) => set({ previousRecoveryAttempts: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="sim-remaining">
                Opportunities left
              </label>
              <input
                id="sim-remaining"
                type="number"
                min="0"
                max="10"
                className={FIELD}
                value={form.remainingRecoveryOpportunities}
                onChange={(e) => set({ remainingRecoveryOpportunities: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="sim-age">
                Age (minutes)
              </label>
              <input
                id="sim-age"
                type="number"
                min="0"
                className={FIELD}
                value={form.timeSinceFailureMinutes}
                onChange={(e) => set({ timeSinceFailureMinutes: e.target.value })}
              />
            </div>
          </div>

          {form.previousRecoveryAction && (
            <div className="border border-obsidian-line bg-obsidian px-3 py-2 text-[11px] font-mono text-ink-faint">
              prior context: {form.previousRecoveryAction} then {form.previousOutcome}
            </div>
          )}

          <div>
            <label className={LABEL} htmlFor="sim-email">
              Customer email (optional)
            </label>
            <input
              id="sim-email"
              type="email"
              className={FIELD}
              placeholder="leave blank to simulate delivery"
              value={form.customerEmail}
              onChange={(e) => set({ customerEmail: e.target.value })}
            />
            <p className="mt-1 flex items-start gap-1.5 text-[10px] text-signal-amber">
              <Mail className="mt-px h-3 w-3 shrink-0" strokeWidth={1.5} />
              Setting this sends a real recovery email to that address. Leave it blank and TRACE
              still renders the email but records delivery as SIMULATED.
            </p>
          </div>

          {duplicateOf && (
            <div className="border border-signal-amber/40 bg-signal-amber-dim/10 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-signal-amber"
                  strokeWidth={1.5}
                />
                <div className="flex-1">
                  <div className="text-xs font-medium text-signal-amber">
                    A case already exists for this payment ID
                  </div>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Ingest is idempotent, so nothing was re-run and no new decision was made.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onClose();
                        navigate(`/cases/${encodeURIComponent(duplicateOf)}`);
                      }}
                    >
                      Open existing case
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setDuplicateOf(null);
                        set({ paymentId: newPaymentId() });
                      }}
                    >
                      Use a new ID
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="border border-signal-red/40 bg-signal-red-dim/10 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-signal-red"
                  strokeWidth={1.5}
                />
                <div>
                  <div className="text-xs font-medium text-signal-red">Ingest failed</div>
                  <p className="mt-1 font-mono text-[11px] text-ink-faint">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-obsidian-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
              {submitting ? "Ingesting..." : "Ingest and open case"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
