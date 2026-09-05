/* Page chrome lives on the desk: slash eyebrow, display heading, hairline. */
export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-void-line px-6 pb-6 pt-8 sm:px-8">
      <div className="min-w-0">
        {/* The accent at full saturation is 2.8:1 on the near-black ground --
            under the floor for 11px type. The lifted variant is the same hue. */}
        {eyebrow && <div className="eyebrow mb-2 text-electric-bright">/ {eyebrow}</div>}
        <h1 className="display text-3xl leading-none text-cream sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-dim">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, action, children, className = "" }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="eyebrow text-cream-dim/70">/ {title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
