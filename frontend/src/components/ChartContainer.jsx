/* A chart is a data record, so it rests on the desk as a cream document. */
export function ChartContainer({ title, subtitle, action, children, height = 260 }) {
  return (
    <div className="record overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-rule px-4 pb-2.5 pt-4">
        <div className="min-w-0">
          <div className="eyebrow text-graphite/60">/ {title}</div>
          {subtitle && (
            <div className="mt-1 text-[13px] leading-snug text-graphite/70">{subtitle}</div>
          )}
        </div>
        {action}
      </div>
      <div style={{ height }} className="px-2 pb-3 pt-2">
        {children}
      </div>
    </div>
  );
}
