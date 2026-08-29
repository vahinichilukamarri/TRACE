export default function ChartContainer({ title, sub, right, children, height = 260 }) {
  return (
    <div className="panel">
      <div className="flex items-start justify-between border-b border-mist-dark/70 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-obsidian">{title}</div>
          {sub && <div className="mt-0.5 text-xs text-obsidian/45">{sub}</div>}
        </div>
        {right}
      </div>
      <div className="px-3 py-4" style={{ height }}>
        {children}
      </div>
    </div>
  );
}
