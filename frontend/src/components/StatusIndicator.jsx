import { SIGNAL_CLASSES } from "@/lib/domain";

/**
 * A small semantic status dot + label. Color always communicates meaning
 * (signal name), never decoration -- see SIGNAL_CLASSES.
 *
 * Rendered on the dark chrome, so it reads the `onDark` group: the cream-tuned
 * values sit near 3:1 on the near-black ground.
 */
export function StatusIndicator({ signal = "neutral", label, pulse = false, size = "sm" }) {
  const cls = SIGNAL_CLASSES[signal] || SIGNAL_CLASSES.neutral;
  const dotSize = size === "lg" ? "w-2.5 h-2.5" : "w-1.5 h-1.5";
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="relative flex shrink-0 items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex ${dotSize} rounded-full ${cls.onDark.dot} opacity-60 animate-ping`}
          />
        )}
        <span className={`relative inline-flex ${dotSize} rounded-full ${cls.onDark.dot}`} />
      </span>
      {label && <span className={`eyebrow truncate ${cls.onDark.text}`}>{label}</span>}
    </span>
  );
}

/**
 * Pill variant for tables / dense rows.
 *
 * Built as a tiny cream chip -- soft tint fill, hairline, ink-dark label. That
 * is the page metaphor at small scale, and it means one style reads correctly
 * on a cream record and on the dark chrome alike, rather than needing the
 * caller to know which ground it landed on.
 */
export function StatusPill({ signal = "neutral", children }) {
  const cls = SIGNAL_CLASSES[signal] || SIGNAL_CLASSES.neutral;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-xs border px-2 py-0.5 ${cls.borderMuted} ${cls.dim}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls.dot}`} />
      <span className={`tnum truncate text-[11px] font-semibold uppercase tracking-[0.1em] ${cls.text}`}>
        {children}
      </span>
    </span>
  );
}
