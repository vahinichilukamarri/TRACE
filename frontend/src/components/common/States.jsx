import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-2.5 py-16 text-obsidian/40">
      <Loader2 size={14} className="animate-spin" strokeWidth={2} />
      <span className="kicker !text-obsidian/40">{label}</span>
    </div>
  );
}

export function ThinkingState({ label = "TRACE is evaluating" }) {
  return (
    <div className="flex items-center gap-2 py-2 text-signal-orange">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-signal-orange" />
      </span>
      <span className="kicker !text-signal-orange">{label}…</span>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong", detail, onRetry }) {
  return (
    <div className="flex flex-col items-start gap-2 border border-signal-red/30 bg-signal-red/5 px-5 py-4">
      <div className="flex items-center gap-2 text-signal-red">
        <AlertTriangle size={14} strokeWidth={2} />
        <span className="text-sm font-medium">{message}</span>
      </div>
      {detail && <p className="font-mono text-xs text-obsidian/50">{String(detail)}</p>}
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost mt-1 !px-3 !py-1.5 text-xs">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label = "No data yet", detail }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-mist-dark py-14 text-center">
      <Inbox size={18} strokeWidth={1.5} className="text-obsidian/25" />
      <span className="text-sm font-medium text-obsidian/50">{label}</span>
      {detail && <span className="max-w-sm text-xs text-obsidian/35">{detail}</span>}
    </div>
  );
}
