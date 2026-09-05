import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  ListChecks,
  Search,
  BarChart3,
  ShieldCheck,
  Radio,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/*
 * The desk. Chrome lives on the warm near-black ground; every data record the
 * pages render is a cream document resting on it. Same system as the landing
 * page, so the marketing surface and the console read as one product.
 */

const NAV_ITEMS = [
  { to: "/dashboard", label: "Command center", icon: LayoutGrid },
  { to: "/cases", label: "Recovery cases", icon: ListChecks },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/policy", label: "Policy & control", icon: ShieldCheck },
];

// Session-scoped, so the rail comes back expanded in a new tab but holds its
// state across navigation and reloads within one sitting.
const COLLAPSE_KEY = "trace.rail.collapsed";

function readCollapsed() {
  try {
    return window.sessionStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    // Private-mode / blocked storage: an unusable preference is not an error.
    return false;
  }
}

export function AppShell({ children }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      window.sessionStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* nothing to persist to; the in-memory state still works */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <div className="flex min-h-screen bg-void text-cream">
      {/* ------------------------------------------------------------ rail
          Width is the only thing that changes: the main column is a flex
          sibling, so the top bar and every page re-measure themselves rather
          than being offset by a hard-coded left inset.

          Pinned to the viewport rather than stretched down the document. The
          page itself scrolls, so a rail that stretched put its collapse toggle
          at the foot of a five-thousand-pixel case file. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col self-start overflow-hidden border-r border-void-line bg-void-soft transition-[width] duration-200 md:flex ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-50" />

        {/* Both states keep the same 61px header height so the mark stays put
            on the baseline the top bar establishes. */}
        <div
          className={`relative flex h-[3.8125rem] items-center border-b border-void-line ${
            collapsed ? "justify-center px-0" : "px-5"
          }`}
        >
          <Link
            to="/"
            className="flex items-baseline gap-1.5 rounded-xs"
            aria-label="TRACE home"
            title={collapsed ? "TRACE" : undefined}
          >
            {/* Collapsed, the wordmark becomes its own monogram rather than a
                different mark: same face, same accent, first letter only. */}
            <span className="display text-2xl tracking-tight text-cream">
              {collapsed ? "T" : "TRACE"}
            </span>
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 translate-y-[-3px] rounded-full bg-electric"
            />
          </Link>
        </div>

        <nav className={`relative flex-1 space-y-1 py-4 ${collapsed ? "px-2" : "px-3"}`}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-xs py-2 text-sm transition-colors ${
                  collapsed ? "justify-center px-0" : "gap-2.5 px-3"
                } ${
                  isActive
                    ? "bg-electric/12 font-medium text-cream ring-1 ring-inset ring-electric/40"
                    : "text-cream-dim hover:bg-cream/5 hover:text-cream"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-electric-bright" : ""}`}
                    strokeWidth={1.5}
                  />
                  {/* Hidden rather than unmounted: the accessible name stays in
                      the tree, so the collapsed rail still reads as a nav. */}
                  <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={`relative border-t border-void-line py-3 ${collapsed ? "px-2" : "px-3"}`}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center rounded-xs py-2 text-cream-dim transition-colors hover:bg-cream/5 hover:text-cream ${
              collapsed ? "justify-center px-0" : "gap-2.5 px-3"
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            )}
            <span className={collapsed ? "sr-only" : "eyebrow"}>Collapse</span>
          </button>

          {!collapsed && (
            <p className="mt-2 px-3 pb-1 text-xs leading-relaxed text-cream-dim">
              Recover more value.
              <br />
              Intervene only when it matters.
            </p>
          )}
        </div>
      </aside>

      {/* ----------------------------------------------------- main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-[3.8125rem] shrink-0 items-center gap-4 border-b border-void-line bg-void px-4 sm:px-6">
          {/* The rail is hidden below md, so the mark has to live here instead. */}
          <Link to="/" className="display shrink-0 rounded-xs text-xl text-cream md:hidden">
            TRACE
          </Link>

          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xs border border-void-line bg-void-soft px-3 py-1.5 transition-colors focus-within:border-electric sm:max-w-80 sm:flex-none"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) {
                // Client-side navigation: window.location.href forced a full
                // page reload and threw away all in-flight state.
                navigate(`/cases/${encodeURIComponent(query.trim())}`);
              }
            }}
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-cream-dim" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to payment ID…"
              aria-label="Jump to payment ID"
              className="tnum w-full min-w-0 bg-transparent text-xs text-cream outline-none placeholder:font-sans placeholder:text-cream-dim"
            />
          </form>

          <div className="eyebrow ml-auto flex shrink-0 items-center gap-2 text-cream-dim">
            <Radio className="h-3 w-3 text-approve-bright" strokeWidth={1.5} />
            <span className="hidden sm:inline">system online</span>
          </div>
        </header>

        {/* Mobile nav: the rail collapses, so the sections still need a home. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-void-line bg-void-soft px-3 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xs px-3 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "bg-electric/12 font-medium text-cream ring-1 ring-inset ring-electric/40"
                    : "text-cream-dim hover:text-cream"
                }`
              }
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
