import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SPRING } from "./motion";

/*
 * A deck of chapter cards, advanced by hand.
 *
 * Self-contained: it reads nothing about scroll position, pins nothing, and
 * installs no scroll or wheel listener. It is one ordinary section in the
 * vertical flow, so the page scrolls past it exactly like any other block.
 *
 * Only the active card (and, briefly, the one being thrown) is mounted. The
 * stage springs to the active card's measured height, so changing chapters
 * never snaps the content below it.
 */

const SWIPE_PX = 80;
const SWIPE_VELOCITY = 450;
/* Gestures starting on a control belong to that control -- the routing
   explainer's sliders are horizontal drags and must not be read as swipes. */
const INTERACTIVE = "input, button, select, textarea, a, [role='slider'], label";

const cardVariants = {
  enter: (dir) => ({
    x: dir > 0 ? "38%" : "-38%",
    rotate: dir * 3,
    scale: 0.96,
    opacity: 0,
    filter: "blur(6px)",
  }),
  center: {
    x: 0,
    rotate: 0,
    scale: 1,
    opacity: 1,
    filter: "blur(0px)",
    transition: { ...SPRING, opacity: { duration: 0.35 }, filter: { duration: 0.4 } },
    transitionEnd: { filter: "none" },
  },
  exit: (dir) => ({
    x: dir > 0 ? "-70%" : "70%",
    rotate: dir * -5,
    scale: 0.94,
    opacity: 0,
    filter: "blur(4px)",
    transition: { duration: 0.42, ease: [0.5, 0, 0.75, 0.2] },
  }),
};

export function CardDeck({ cards, label = "Chapters" }) {
  const [[index, dir], setState] = useState([0, 0]);
  const [height, setHeight] = useState("auto");
  const activeRef = useRef(null);
  const drag = useDragControls();

  const count = cards.length;

  // Takes a destination, not a step, so the dots genuinely jump to their card
  // rather than nudging one along and contradicting their own label.
  const goTo = useCallback(
    (next) => {
      if (next === index || next < 0 || next >= count) return;
      setState([next, next > index ? 1 : -1]);
    },
    [index, count]
  );

  const step = useCallback((d) => goTo(index + d), [goTo, index]);

  // The stage follows the active card's height, including when the card's own
  // content grows (the recovery loop adds rows as it runs).
  useLayoutEffect(() => {
    const node = activeRef.current;
    if (!node) return undefined;
    setHeight(node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [index]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  };

  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest(INTERACTIVE)) return;
    drag.start(e);
  };

  const onDragEnd = (_, info) => {
    const { offset, velocity } = info;
    if (offset.x < -SWIPE_PX || velocity.x < -SWIPE_VELOCITY) step(1);
    else if (offset.x > SWIPE_PX || velocity.x > SWIPE_VELOCITY) step(-1);
  };

  const card = cards[index];

  const surface = (c) =>
    `overflow-hidden rounded-sm ${
      c.dark
        ? "glass glass-solid text-cream"
        : "border border-rule bg-paper text-graphite shadow-[0_2px_6px_rgba(0,0,0,0.45),0_26px_60px_-28px_rgba(0,0,0,0.9)]"
    }`;

  return (
    <div
      role="group"
      aria-roledescription="card deck"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative"
    >
      {/* Stage: springs to the active card's height. */}
      <motion.div
        className="relative"
        animate={{ height }}
        transition={{ type: "spring", stiffness: 220, damping: 32 }}
      >
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={card.id}
            ref={activeRef}
            custom={dir}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            dragSnapToOrigin
            onDragEnd={onDragEnd}
            onPointerDown={onPointerDown}
            style={{ touchAction: "pan-y" }}
            className={`absolute inset-x-0 top-0 cursor-grab active:cursor-grabbing ${surface(card)}`}
          >
            <div className="p-6 sm:p-10">{card.render()}</div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Controls and position. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="flex gap-2">
          {[
            [-1, "Previous chapter", ArrowLeft, index === 0],
            [1, "Next chapter", ArrowRight, index === count - 1],
          ].map(([d, aria, Icon, disabled]) => (
            <motion.button
              key={d}
              type="button"
              onClick={() => step(d)}
              disabled={disabled}
              aria-label={aria}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xs border border-cream/20 text-cream transition-colors hover:border-electric hover:text-electric disabled:pointer-events-none disabled:opacity-30"
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </motion.button>
          ))}
        </div>

        <span className="eyebrow tnum inline-flex overflow-hidden text-cream">
          <span className="relative inline-block h-[1.2em] w-[2ch]">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.span
                key={index}
                custom={dir}
                initial={{ y: dir >= 0 ? "100%" : "-100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: dir >= 0 ? "-100%" : "100%", opacity: 0 }}
                transition={SPRING}
                className="absolute inset-0"
              >
                {String(index + 1).padStart(2, "0")}
              </motion.span>
            </AnimatePresence>
          </span>
          &nbsp;/ {String(count).padStart(2, "0")}
        </span>

        <div className="flex gap-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${c.title}`}
              aria-current={i === index}
              className="relative h-1.5 w-7 rounded-full bg-cream/20 transition-colors hover:bg-cream/40"
            >
              {i === index && (
                <motion.span
                  layoutId="deck-dot"
                  className="absolute inset-0 rounded-full bg-electric shadow-[0_0_12px_rgba(47,48,255,0.8)]"
                  transition={SPRING}
                />
              )}
            </button>
          ))}
        </div>

        <span className="eyebrow ml-auto hidden text-cream-dim/55 sm:inline">
          / drag, arrow keys, or the controls
        </span>
      </div>

      <p aria-live="polite" className="sr-only">
        Chapter {index + 1} of {count}: {card.title}
      </p>
    </div>
  );
}
