import { SIGNAL_CLASSES } from "@/lib/domain";

/**
 * A small semantic status dot + label. Color always communicates meaning
 * (signal name), never decoration -- see SIGNAL_CLASSES.
 */
export function StatusIndicator({ signal = "neutral", label, pulse = false, size = "sm" }) {
  const cls = SIGNAL_CLASSES[signal] || SIGNAL_CLASSES.neutral;
  const dotSize = size === "lg" ? "w-2.5 h-2.5" : "w-1.5 h-1.5";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex ${dotSize} rounded-full ${cls.dot} opacity-60 animate-ping`}
          />
        )}
        <span className={`relative inline-flex ${dotSize} rounded-full ${cls.dot}`} />
      </span>
      {label && (
        <span className={`text-xs font-medium tracking-wide uppercase ${cls.text}`}>{label}</span>
      )}
    </span>
  );
}

/** Pill variant for tables / dense rows */
export function StatusPill({ signal = "neutral", children }) {
  const cls = SIGNAL_CLASSES[signal] || SIGNAL_CLASSES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 border ${cls.borderMuted} ${cls.dimMuted} rounded-xs`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />
      <span className={`text-[11px] font-mono font-medium tracking-wide uppercase ${cls.text}`}>
        {children}
      </span>
    </span>
  );
}
