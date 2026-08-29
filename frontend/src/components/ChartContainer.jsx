export function ChartContainer({ title, subtitle, action, children, height = 260 }) {
  return (
    <div className="border border-obsidian-line bg-obsidian-soft">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-xs font-medium tracking-[0.08em] uppercase text-bone">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-faint mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ height }} className="px-2 pb-3">
        {children}
      </div>
    </div>
  );
}
