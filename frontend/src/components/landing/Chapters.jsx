import { useRef, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { SPRING } from "./motion";
import { usePrefersReducedMotion } from "./useInView";

/*
 * The argument as a run of full-size chapter sheets in ordinary page flow.
 *
 * Nothing is pinned, scaled to fit or clipped: every sheet is read at its
 * natural size. Two things move with the scroll instead --
 *   - each sheet is laid onto the desk as it arrives: it unfolds out of a
 *     narrower, lower, slightly tilted position, tied to scroll so it reverses
 *     when the reader goes back up;
 *   - a chapter index rides alongside (a rail on wide screens, a pill under
 *     the header on phones), with a line that fills as the argument is read
 *     and a marker that slides to the chapter in view.
 */

const HEADER_PX = 72;

function surface(c) {
  return `rounded-sm ${
    c.dark
      ? "glass glass-solid text-cream"
      : "border border-rule bg-paper text-graphite shadow-[0_2px_6px_rgba(0,0,0,0.45),0_26px_60px_-28px_rgba(0,0,0,0.9)]"
  }`;
}

function Sheet({ card, index, reduced, sheetRef }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.45"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });

  const y = useTransform(p, [0, 1], [90, 0]);
  const scale = useTransform(p, [0, 1], [0.93, 1]);
  const rotate = useTransform(p, [0, 1], [index % 2 ? 1.6 : -1.6, 0]);
  const opacity = useTransform(p, [0, 0.6], [0.25, 1]);
  const inset = useTransform(p, [0, 1], [7, 0]);
  const clipPath = useMotionTemplate`inset(0% ${inset}% 0% ${inset}% round 6px)`;

  return (
    <motion.article
      ref={(node) => {
        ref.current = node;
        sheetRef(node);
      }}
      id={`chapter-${card.id}`}
      aria-label={card.title}
      style={reduced ? undefined : { y, scale, rotate, opacity, clipPath }}
      className={`origin-top scroll-mt-28 will-change-transform ${surface(card)}`}
    >
      <div className="p-6 sm:p-10">{card.render()}</div>
    </motion.article>
  );
}

export function Chapters({ cards, heading }) {
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef(null);
  const sheets = useRef([]);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ["start 0.5", "end 0.5"] });
  const fill = useSpring(scrollYProgress, { stiffness: 160, damping: 30, restDelta: 0.001 });

  // The chapter in view is the last sheet whose top has passed 40% of the
  // viewport -- read off the same scroll signal, so the index never lags.
  useMotionValueEvent(scrollYProgress, "change", () => {
    const line = window.innerHeight * 0.4;
    let next = 0;
    sheets.current.forEach((node, i) => {
      if (node && node.getBoundingClientRect().top <= line) next = i;
    });
    setActive((cur) => (cur === next ? cur : next));
  });

  const goTo = (i) => {
    const node = sheets.current[i];
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - HEADER_PX - 24;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  const count = cards.length;
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div ref={wrapRef}>
      {heading}

      {/* Phones: a pill under the header naming the chapter in view. */}
      <div className="sticky z-30 -mx-2 mb-6 lg:hidden" style={{ top: HEADER_PX }}>
        <div className="glass glass-solid relative overflow-hidden rounded-full px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="eyebrow tnum text-electric-bright">
              {pad(active + 1)} / {pad(count)}
            </span>
            <motion.span
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
              className="truncate text-sm text-cream"
            >
              {cards[active].title}
            </motion.span>
          </div>
          <motion.span
            aria-hidden="true"
            style={{ scaleX: fill }}
            className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-electric"
          />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-14">
        {/* Wide screens: the chapter rail. */}
        <nav aria-label="Chapters" className="hidden lg:block">
          <div className="sticky" style={{ top: HEADER_PX + 40 }}>
            <div className="eyebrow mb-5 text-cream-dim/50">/ chapters</div>
            <div className="relative pl-5">
              <span aria-hidden="true" className="absolute bottom-1 left-0 top-1 w-px bg-cream/12" />
              <motion.span
                aria-hidden="true"
                style={{ scaleY: fill }}
                className="absolute bottom-1 left-0 top-1 w-px origin-top bg-electric shadow-[0_0_10px_rgba(47,48,255,0.9)]"
              />
              <ol className="space-y-1">
                {cards.map((c, i) => {
                  const on = i === active;
                  return (
                    <li key={c.id} className="relative">
                      {on && (
                        <motion.span
                          layoutId="chapter-marker"
                          transition={SPRING}
                          aria-hidden="true"
                          className="absolute -left-[23px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-electric shadow-[0_0_0_4px_rgba(47,48,255,0.22),0_0_14px_rgba(47,48,255,0.9)]"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        aria-current={on ? "step" : undefined}
                        className="group flex w-full items-baseline gap-3 py-1.5 text-left"
                      >
                        <span
                          className={`eyebrow tnum transition-colors duration-300 ${
                            on ? "text-electric-bright" : "text-cream-dim/35"
                          }`}
                        >
                          {pad(i + 1)}
                        </span>
                        <motion.span
                          animate={{ x: on ? 4 : 0, opacity: on ? 1 : 0.5 }}
                          transition={SPRING}
                          className="text-sm text-cream group-hover:opacity-100"
                        >
                          {c.title}
                        </motion.span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </nav>

        <div className="space-y-10 sm:space-y-14">
          {cards.map((c, i) => (
            <Sheet
              key={c.id}
              card={c}
              index={i}
              reduced={reduced}
              sheetRef={(node) => {
                sheets.current[i] = node;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
