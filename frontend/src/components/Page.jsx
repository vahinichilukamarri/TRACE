export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-6 px-8 pt-8 pb-6 border-b border-obsidian-line">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-signal-orange mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-bone">{title}</h1>
        {description && <p className="text-sm text-ink-faint mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, action, children, className = "" }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-ink-faint">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
