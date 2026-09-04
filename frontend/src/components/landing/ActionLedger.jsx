import { useState } from "react";
import { useInView, usePrefersReducedMotion } from "./useInView";

/*
 * The closed action set, priced.
 *
 * The bar is deliberately NOT linear: at ₹150 against ₹0.50, a linear scale
 * renders five of the six actions as invisible slivers and communicates nothing.
 * Square-root scaling keeps the ordering honest while leaving the small costs
 * legible, and the caption says so rather than letting the reader assume linear.
 */

const MAX_COST = 150;

const ACTIONS = [
  {
    name: "Retry payment",
    cost: 0.5,
    direct: true,
    detail:
      "Re-presents the same instrument. Cheapest thing the system can do and the strongest move on a bank timeout, where the failure was infrastructure rather than the customer.",
  },
  {
    name: "Send recovery link",
    cost: 2.0,
    direct: true,
    detail:
      "A real email through SMTP with a payment link. Costs a send and a piece of the customer's attention, so the repeat limit caps it at one use per case.",
  },
  {
    name: "Suggest alternative method",
    cost: 2.0,
    direct: true,
    detail:
      "Offers a different instrument. The strongest option on a card decline, where re-presenting the same card mostly reproduces the same decline.",
  },
  {
    name: "Wait and reassess",
    cost: 0.0,
    direct: false,
    detail:
      "Spends nothing but time. On insufficient funds that is often exactly right — the balance may arrive on its own, and contacting the customer cannot make it arrive faster.",
  },
  {
    name: "Escalate for review",
    cost: 150.0,
    direct: false,
    detail:
      "A person's time, and by far the most expensive action available. Reserved for high-value cases and low-confidence proposals — the policy layer forces it rather than the agent choosing it freely.",
  },
  {
    name: "Stop recovery",
    cost: 0.0,
    direct: false,
    detail:
      "Closes the case. Costs nothing and recovers nothing, and on a genuinely unrecoverable payment it is the correct decision — most of the cases TRACE declines to pursue end here.",
  },
];

export function ActionLedger() {
  const reduced = usePrefersReducedMotion();
  const [ref, seen] = useInView();
  const [active, setActive] = useState(0);
  const shown = ACTIONS[active];

  return (
    <div ref={ref}>
      <ul className="divide-y divide-rule border-y border-rule">
        {ACTIONS.map((a, i) => {
          const width = Math.sqrt(a.cost / MAX_COST) * 100;
          const isActive = i === active;
          return (
            <li key={a.name}>
              <button
                type="button"
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                aria-pressed={isActive}
                className={`grid w-full items-center gap-x-5 gap-y-1.5 px-2 py-3.5 text-left transition-colors sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_5.5rem_6.5rem] ${
                  isActive ? "bg-paper-alt" : "hover:bg-paper-alt/60"
                }`}
              >
                <span className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                  {a.name}
                </span>

                <span className="relative hidden h-2.5 overflow-hidden rounded-xs bg-rule/45 sm:block">
                  {/* Graphite, not a verdict colour: on this page red means
                      BLOCKED, and a red cost bar would read as "this action was
                      refused". Magnitude is carried by width alone. */}
                  <span
                    className={`absolute inset-y-0 left-0 rounded-xs bg-gradient-to-r from-graphite/75 to-graphite ${
                      seen && !reduced ? "anim-sweep" : ""
                    }`}
                    style={{
                      width: `${Math.max(a.cost > 0 ? 3 : 0, width)}%`,
                      animationDelay: reduced ? undefined : `${i * 70}ms`,
                    }}
                  />
                </span>

                <span className="tnum text-sm sm:text-right">
                  {a.cost === 0 ? "₹0.00" : `₹${a.cost.toFixed(2)}`}
                </span>
                <span
                  className={`whitespace-nowrap text-xs sm:text-right ${
                    a.direct ? "font-medium text-approve" : "text-graphite/45"
                  }`}
                >
                  {a.direct ? "Can recover" : "Cannot"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* The bars are sm-and-up only, so the note about their scale is too. */}
      <p className="mt-2.5 hidden text-xs text-graphite/45 sm:block">
        Bars are square-root scaled — a linear scale would render everything but escalation as a
        sliver. Ordering is preserved; widths are not proportional.
      </p>

      {/* Reveal panel. One region, replaced in place, so the list never reflows
          under the cursor while the reader is scanning it. */}
      <div
        aria-live="polite"
        className="mt-5 rounded-sm border border-rule bg-paper-hi p-5 shadow-[0_1px_2px_rgba(20,22,26,0.04)]"
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[15px] font-semibold">{shown.name}</span>
          <span className="tnum text-sm text-graphite/60">
            {shown.cost === 0 ? "₹0.00" : `₹${shown.cost.toFixed(2)}`} per use
          </span>
        </div>
        <p key={shown.name} className="anim-rise mt-2 max-w-[64ch] text-sm leading-relaxed text-graphite/70">
          {shown.detail}
        </p>
      </div>

      <p className="mt-5 max-w-[62ch] text-sm leading-relaxed text-graphite/55">
        Only the first three can complete a payment on the turn they run, so only they earn an
        expected recovery value. The other three carry their cost with nothing to offset it — which
        is why escalation is spent sparingly, and why an agent that stops early can still be the one
        making money.
      </p>
    </div>
  );
}
