import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  ListChecks,
  Search,
  BarChart3,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Command center", icon: LayoutGrid },
  { to: "/cases", label: "Recovery cases", icon: ListChecks },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/policy", label: "Policy & control", icon: ShieldCheck },
];

export function AppShell({ children }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-obsidian text-bone flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-obsidian-line flex flex-col">
        <div className="px-5 py-5 border-b border-obsidian-line">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-signal-orange animate-pulse-slow" />
            <span className="font-semibold tracking-tight text-lg">TRACE</span>
          </Link>
          <div className="text-[10px] font-mono text-ink-faint mt-1 leading-snug">
            Transaction Recovery Agent
            <br />
            with Contextual Evaluation
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-sm rounded-xs transition-colors ${
                  isActive
                    ? "bg-obsidian-soft text-signal-orange border-l-2 border-signal-orange -ml-px pl-[11px]"
                    : "text-ink-soft hover:text-bone hover:bg-obsidian-soft/60"
                }`
              }
            >
              <item.icon className="w-4 h-4" strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-obsidian-line">
          <div className="text-[10px] font-mono text-ink-faint leading-relaxed">
            Recover more value.
            <br />
            Intervene only when it matters.
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-obsidian-line flex items-center justify-between px-6">
          <form
            className="flex items-center gap-2 bg-obsidian-soft border border-obsidian-line px-3 py-1.5 w-80 max-w-full"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) {
                // Client-side navigation: window.location.href forced a full
                // page reload and threw away all in-flight state.
                navigate(`/cases/${encodeURIComponent(query.trim())}`);
              }
            }}
          >
            <Search className="w-3.5 h-3.5 text-ink-faint shrink-0" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to payment ID…"
              className="bg-transparent text-xs font-mono text-bone placeholder:text-ink-faint outline-none w-full"
            />
          </form>

          <div className="flex items-center gap-2 text-[11px] font-mono text-ink-faint">
            <Radio className="w-3 h-3 text-signal-mint" strokeWidth={1.5} />
            <span>SYSTEM ONLINE</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
