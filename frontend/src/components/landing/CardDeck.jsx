import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePrefersReducedMotion } from "./useInView";

/*
 * A deck of chapter cards, advanced by hand.
 *
 * Self-contained: it reads nothing about scroll position, pins nothing, and
 * installs no scroll or wheel listener. It is one ordinary section in the
 * vertical flow, so the page scrolls past it exactly like any other block.
 *
 * Only the active card (and, briefly, the one being thrown) is mounted. That
 * keeps a single heavy component on the page at a time and lets the section's
 * height follow the active card naturally, with no measurement.
 */

const SWIPE_MIN_PX = 48;
const THROW_MS = 460;
/* Gestures starting on a control belong to that control -- the routing
   explainer's sliders are horizontal drags and must not be read as swipes. */
const INTERACTIVE = "input, button, select, textarea, a, [role='slider'], label";

export function CardDeck({ cards, label = "Chapters" }) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(null); // { index, dir }
  const busy = useRef(false);
  const timer = useRef(0);
  const touch = useRef(null);

  const count = cards.length;

  useEffect(() => () => clearTimeout(timer.current), []);

  // Takes a destination, not a step, so the dots genuinely jump to their card
  // rather than nudging one along and contradicting their own label.
  const goTo = useCallback(
    (next) => {
      if (next === index || next < 0 || next >= count || busy.current) return;
      const dir = next > index ? 1 : -1;

      if (reduced) {
        setIndex(next);
        return;
      }

      busy.current = true;
      setLeaving({ index, dir });
      setIndex(next);
      // Fallback clean-up: animationend can be missed if the element is removed
      // or the animation never starts, and a stuck `busy` would freeze the deck.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setLeaving(null);
        busy.current = false;
      }, THROW_MS + 80);
    },
    [index, count, reduced]
  );

  const step = useCallback((dir) => goTo(index + dir), [goTo, index]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  };

  const onTouchStart = (e) => {
    if (e.target.closest && e.target.closest(INTERACTIVE)) {
      touch.current = null;
      return;
    }
    const t = e.changedTouches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };

  // Read on touchend and never preventDefault: a vertical drag stays an ordinary
  // page scroll, and only a decisively horizontal one turns a card.
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    step(dx < 0 ? 1 : -1);
  };

  const card = cards[index];
  const leavingCard = leaving ? cards[leaving.index] : null;

  const surface = (c) =>
    `overflow-hidden rounded-sm ${
      c.dark
        ? "glass text-cream"
        : "border border-rule bg-paper text-graphite shadow-[0_2px_6px_rgba(0,0,0,0.45),0_26px_60px_-28px_rgba(0,0,0,0.9)]"
    }`;

  return (
    <div
      role="group"
      aria-roledescription="card deck"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {/* Stage. `relative` so the thrown card can overlay without the section
          collapsing; the active card stays in flow and sets the height. */}
      <div className="relative">
        <div
          key={card.id}
          className={`${surface(card)} ${
            reduced || !leaving ? "" : leaving.dir > 0 ? "card-in-right" : "card-in-left"
          }`}
        >
          <div className="p-6 sm:p-10">{card.render()}</div>
        </div>

        {leavingCard && !reduced && (
          <div
            key={`leaving-${leavingCard.id}`}
            aria-hidden="true"
            onAnimationEnd={() => {
              clearTimeout(timer.current);
              setLeaving(null);
              busy.current = false;
            }}
            className={`pointer-events-none absolute inset-0 ${surface(leavingCard)} ${
              leaving.dir > 0 ? "card-out-left" : "card-out-right"
            }`}
          >
            <div className="p-6 sm:p-10">{leavingCard.render()}</div>
          </div>
        )}
      </div>

      {/* Controls and position. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Previous chapter"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xs border border-cream/20 text-cream transition-colors hover:border-electric hover:text-electric disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={index === count - 1}
            aria-label="Next chapter"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xs border border-cream/20 text-cream transition-colors hover:border-electric hover:text-electric disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <span className="eyebrow tnum text-cream">
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>

        <div className="flex gap-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${c.title}`}
              aria-current={i === index}
              className={`h-1.5 w-7 rounded-full transition-colors ${
                i === index ? "bg-electric" : "bg-cream/25 hover:bg-cream/45"
              }`}
            />
          ))}
        </div>

        <span className="eyebrow ml-auto hidden text-cream-dim/55 sm:inline">
          / swipe, arrow keys, or the controls
        </span>
      </div>

      <p aria-live="polite" className="sr-only">
        Chapter {index + 1} of {count}: {card.title}
      </p>
    </div>
  );
}
