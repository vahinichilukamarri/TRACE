export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-[11px] px-2.5 py-1.5",
    md: "text-xs px-3.5 py-2",
  };
  const variants = {
    primary: "bg-signal-orange text-obsidian hover:bg-signal-orange/90",
    secondary: "border border-obsidian-line text-bone hover:border-signal-orange/50 hover:text-signal-orange",
    ghost: "text-ink-faint hover:text-bone",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
