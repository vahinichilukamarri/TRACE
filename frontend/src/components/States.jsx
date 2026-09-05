import { AlertTriangle, CheckCircle2, Inbox, Loader2, ScanLine, ShieldAlert } from "lucide-react";

/*
 * Feedback states are chrome, not records: they report on the app rather than
 * carry data, so they stay on the dark ground and read the `onDark` colours.
 */

/** Generic loading skeleton -- used while a request is in flight. */
export function LoadingState({ label = "Loading" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-cream-dim">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
      <span className="eyebrow">/ {label}</span>
    </div>
  );
}

/** TRACE's "thinking" state -- shown while the agent is evaluating a case. */
export function ThinkingState({ label = "TRACE is evaluating this case" }) {
  return (
    <div className="glass relative flex items-center gap-3 overflow-hidden rounded-sm px-4 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-scan absolute left-0 top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-electric/20 to-transparent" />
      </div>
      <ScanLine className="relative z-10 h-4 w-4 shrink-0 text-electric-bright" strokeWidth={1.5} />
      <span className="eyebrow relative z-10 text-electric-bright">/ {label}</span>
    </div>
  );
}

/** Empty state -- an invitation to act, per copy guidelines. */
export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-void-line px-6 py-16 text-center">
      <Icon className="h-6 w-6 text-cream-dim" strokeWidth={1.25} />
      <div className="text-sm font-medium text-cream">{title}</div>
      {description && (
        <div className="wrap-prose max-w-sm text-xs leading-relaxed text-cream-dim">
          {description}
        </div>
      )}
      {action}
    </div>
  );
}

/** Error state -- names what happened, no vagueness. */
export function ErrorState({ title = "This request failed", description, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-block-bright/30 bg-block-bright/8 px-6 py-16 text-center">
      <AlertTriangle className="h-6 w-6 text-block-bright" strokeWidth={1.5} />
      <div className="text-sm font-medium text-cream">{title}</div>
      {/* Server messages and stack traces are arbitrary length and have no
          spaces to break on -- they must wrap, never widen the page. */}
      {description && (
        <div className="tnum wrap-prose max-w-lg text-xs leading-relaxed text-cream-dim">
          {description}
        </div>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-xs border border-block-bright/40 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.08em] text-block-bright transition-colors hover:bg-block-bright/10"
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
    <div className="flex items-center gap-3 rounded-sm border border-approve-bright/30 bg-approve-bright/8 px-4 py-4">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-approve-bright" strokeWidth={1.5} />
      <div className="min-w-0">
        <div className="eyebrow text-approve-bright">/ {title}</div>
        {description && (
          <div className="wrap-prose mt-1 text-xs leading-relaxed text-cream-dim">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

/** Review / escalation state. */
export function ReviewState({ title = "Flagged for review", description }) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-hold-bright/30 bg-hold-bright/8 px-4 py-4">
      <ShieldAlert className="h-4 w-4 shrink-0 text-hold-bright" strokeWidth={1.5} />
      <div className="min-w-0">
        <div className="eyebrow text-hold-bright">/ {title}</div>
        {description && (
          <div className="wrap-prose mt-1 text-xs leading-relaxed text-cream-dim">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}
