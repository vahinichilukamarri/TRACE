export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xs font-medium uppercase tracking-[0.08em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-[11px] px-2.5 py-1.5",
    md: "text-xs px-3.5 py-2",
  };
  // Variants are written for the dark chrome, where every button in the app
  // currently sits. The accent carries the primary action; secondary and ghost
  // stay in cream so colour is spent only where it means something.
  const variants = {
    primary: "bg-electric text-white hover:bg-electric-deep",
    secondary: "border border-cream/20 text-cream hover:border-electric hover:text-electric-bright",
    ghost: "text-cream-dim hover:text-cream",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
