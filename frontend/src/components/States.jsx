import { AlertTriangle, CheckCircle2, Inbox, Loader2, ScanLine, ShieldAlert } from "lucide-react";

/** Generic loading skeleton -- used while a request is in flight. */
export function LoadingState({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-3 py-10 justify-center text-ink-faint">
      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
      <span className="text-xs font-mono tracking-wide uppercase">{label}</span>
    </div>
  );
}

/** TRACE's "thinking" state -- shown while the agent is evaluating a case. */
export function ThinkingState({ label = "TRACE is evaluating this case" }) {
  return (
    <div className="relative flex items-center gap-3 py-8 px-4 border border-obsidian-line bg-obsidian-soft overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 h-full w-1/3 bg-gradient-to-r from-transparent via-signal-orange/10 to-transparent animate-scan" />
      </div>
      <ScanLine className="w-4 h-4 text-signal-orange relative z-10" strokeWidth={1.5} />
      <span className="text-xs font-mono tracking-wide uppercase text-signal-orange relative z-10">
        {label}
      </span>
    </div>
  );
}

/** Empty state -- an invitation to act, per copy guidelines. */
export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center border border-dashed border-obsidian-line">
      <Icon className="w-6 h-6 text-ink-faint" strokeWidth={1.25} />
      <div className="text-sm font-medium text-bone">{title}</div>
      {description && <div className="text-xs text-ink-faint max-w-sm">{description}</div>}
      {action}
    </div>
  );
}

/** Error state -- names what happened, no vagueness. */
export function ErrorState({ title = "This request failed", description, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center border border-signal-red/30 bg-signal-red-dim/10">
      <AlertTriangle className="w-6 h-6 text-signal-red" strokeWidth={1.5} />
      <div className="text-sm font-medium text-bone">{title}</div>
      {description && <div className="text-xs text-ink-faint max-w-sm font-mono">{description}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wide border border-signal-red/40 text-signal-red hover:bg-signal-red/10 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** Success / recovered transition -- restrained, not celebratory. */
export function SuccessState({ title = "Payment recovered", description }) {
  return (
    <div className="flex items-center gap-3 py-4 px-4 border border-signal-mint/30 bg-signal-mint-dim/10">
      <CheckCircle2 className="w-4 h-4 text-signal-mint shrink-0" strokeWidth={1.5} />
      <div>
        <div className="text-xs font-medium text-signal-mint uppercase tracking-wide">{title}</div>
        {description && <div className="text-xs text-ink-faint font-mono">{description}</div>}
      </div>
    </div>
  );
}

/** Review / escalation state. */
export function ReviewState({ title = "Flagged for review", description }) {
  return (
    <div className="flex items-center gap-3 py-4 px-4 border border-signal-amber/30 bg-signal-amber-dim/10">
      <ShieldAlert className="w-4 h-4 text-signal-amber shrink-0" strokeWidth={1.5} />
      <div>
        <div className="text-xs font-medium text-signal-amber uppercase tracking-wide">{title}</div>
        {description && <div className="text-xs text-ink-faint font-mono">{description}</div>}
      </div>
    </div>
  );
}
