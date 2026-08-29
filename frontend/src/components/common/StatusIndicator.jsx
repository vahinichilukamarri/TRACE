export default function StatusIndicator({ color, label, pulse = false, size = "default" }) {
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex" style={{ width: 8, height: 8 }}>
        {pulse && (
          <span
            className={`absolute inline-flex ${dotSize} animate-pulse-dot rounded-full`}
            style={{ backgroundColor: color }}
          />
        )}
        {!pulse && <span className={`inline-flex ${dotSize} rounded-full`} style={{ backgroundColor: color }} />}
      </span>
      {label && <span className="text-xs font-medium" style={{ color }}>{label}</span>}
    </span>
  );
}
