import { NavLink } from "react-router-dom";
import { Activity, LayoutGrid, ListTree, Search, ShieldCheck, Radio } from "lucide-react";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutGrid, end: true },
  { to: "/cases", label: "Recovery Cases", icon: ListTree },
  { to: "/performance", label: "Performance", icon: Activity },
  { to: "/policy", label: "Policy Control", icon: ShieldCheck },
];

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-obsidian-600 bg-obsidian text-bone">
      <div className="flex items-center gap-2.5 border-b border-obsidian-600 px-5 py-5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-signal-orange" />
        </span>
        <div>
          <div className="font-mono text-sm font-semibold tracking-[0.14em]">TRACE</div>
          <div className="kicker !text-bone/40">Recovery Console</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-obsidian-700 text-signal-orange border-l-2 border-signal-orange -ml-0.5 pl-[11px]"
                  : "text-bone/55 hover:bg-obsidian-700 hover:text-bone",
              ].join(" ")
            }
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-obsidian-600 px-4 py-4">
        <div className="flex items-center gap-2 text-bone/45">
          <Radio size={12} strokeWidth={1.75} />
          <span className="kicker !text-bone/45">System Observing</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-bone/35">
          Recover more value. Intervene only when it matters.
        </p>
      </div>
    </aside>
  );
}
