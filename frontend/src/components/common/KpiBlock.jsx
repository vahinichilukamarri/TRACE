export default function KpiBlock({ label, value, sub, tone = "default", size = "default" }) {
  const toneClass =
    {
      default: "text-obsidian",
      orange: "text-signal-orange",
      mint: "text-signal-mint",
      amber: "text-signal-amber",
      red: "text-signal-red",
    }[tone] || "text-obsidian";

  return (
    <div className="border-l-2 border-mist-dark pl-4">
      <div className="kicker">{label}</div>
      <div
        className={`mono-num mt-1.5 font-semibold leading-none ${toneClass} ${
          size === "hero" ? "text-[2.75rem]" : "text-2xl"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-obsidian/45">{sub}</div>}
    </div>
  );
}
