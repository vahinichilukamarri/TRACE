import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./useInView";
import { useTrackProgress } from "./useTrackProgress";

/*
 * The numbered chapters, advanced sideways.
 *
 * A tall track holds a sticky viewport-high window; scroll progress through the
 * track translates a rail of full-width panels horizontally. The page scrolls
 * natively the whole time -- nothing intercepts the wheel, nothing rewrites
 * scroll speed. Horizontal movement is the RESPONSE to scrolling, not a
 * replacement for it, so momentum, scrollbars, find-in-page and the keyboard all
 * behave exactly as they would on an ordinary page.
 *
 * Progress comes from useTrackProgress, which samples position per frame while
 * the track is near the viewport rather than waiting on `scroll` events -- those
 * go quiet during momentum and strand the rail mid-slide.
 *
 * Cards settle to a readable position in JS rather than with CSS scroll-snap:
 * snap-type can only be set on the document scroller, where `mandatory` traps
 * the page at the rail and `proximity` only catches when a gesture happens to
 * end nearby. This settles after the gesture ends and never blocks scrolling on.
 *
 * Falls back to plain vertical stacking when motion is reduced, when the
 * viewport is too small, or -- measured, not guessed -- when any panel's content
 * is taller than the viewport. A pinned panel cannot be scrolled inside, so
 * overflow there is unreachable content, not a cosmetic issue.
 */

const MIN_PIN_WIDTH = 1024;
const MIN_PIN_HEIGHT = 720;
/* Content must clear the viewport by this much or the pin is refused. */
const HEIGHT_SLACK = 24;
const SWIPE_MIN_PX = 48;
/* How still the scroll must be, and for how long, before a card is settled. */
const SETTLE_EPSILON = 0.0008;
const SETTLE_IDLE_MS = 140;

const fitsViewport = () =>
  typeof window === "undefined" ||
  (window.innerWidth >= MIN_PIN_WIDTH && window.innerHeight >= MIN_PIN_HEIGHT);

export function HorizontalSequence({ panels, label = "Numbered chapters" }) {
  const reduced = usePrefersReducedMotion();
  const trackRef = useRef(null);
  const railRef = useRef(null);
  const progressRef = useRef(null);
  const contentRefs = useRef([]);
  const touch = useRef(null);

  const [roomToPin, setRoomToPin] = useState(fitsViewport);
  const [contentFits, setContentFits] = useState(true);
  const [index, setIndex] = useState(0);

  const count = panels.length;
  const staticMode = reduced || !roomToPin || !contentFits;

  /* --------------------------------------------------- fit measurement */
  useEffect(() => {
    const measure = () => {
      const sizeOk = fitsViewport();
      setRoomToPin(sizeOk);
      // Panel heights are unaffected by translateX, so this reads true in both
      // modes and the decision cannot oscillate.
      const tallest = contentRefs.current.reduce(
        (max, el) => (el ? Math.max(max, el.offsetHeight) : max),
        0
      );
      setContentFits(tallest === 0 || tallest <= window.innerHeight - HEIGHT_SLACK);
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* --------------------------------------------------- explicit navigation */
  // Navigation is expressed as a scroll position, so arrows, dots and swipes all
  // go through the browser's own scrolling rather than a parallel animation.
  const goTo = useCallback(
    (i) => {
      const track = trackRef.current;
      if (!track || staticMode) return;
      const target = Math.max(0, Math.min(count - 1, i));
      const rect = track.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      // Document offset, not offsetTop: offsetTop is measured from the nearest
      // positioned ancestor, so it silently becomes wrong the moment the rail
      // gains a `relative` wrapper.
      const trackTop = rect.top + window.scrollY;
      const top = trackTop + (travel * target) / (count - 1);
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    },
    [count, staticMode, reduced]
  );

  /* --------------------------------------------------- progress -> translate */
  const lastIndex = useRef(-1);

  const goToRef = useRef(goTo);
  useEffect(() => {
    goToRef.current = goTo;
  });
  const lastP = useRef(-1);
  const idleSince = useRef(0);
  const settled = useRef(false);

  useTrackProgress(trackRef, !staticMode, (p) => {
    const rail = railRef.current;
    if (!rail) return;

    // Writes only. No layout is read here, so this never thrashes.
    rail.style.transform = `translate3d(${(-p * (count - 1) * 100).toFixed(4)}%, 0, 0)`;
    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
    }

    const i = Math.round(p * (count - 1));
    if (i !== lastIndex.current) {
      lastIndex.current = i;
      setIndex(i);
    }

    // Settle to the nearest card once the reader stops. This runs only while
    // the track is on screen and only AFTER a gesture ends, so it never fights
    // an in-progress scroll and never prevents scrolling past the section --
    // which is exactly what CSS `scroll-snap-type: mandatory` got wrong.
    const now = performance.now();
    if (Math.abs(p - lastP.current) > SETTLE_EPSILON) {
      lastP.current = p;
      idleSince.current = now;
      settled.current = false;
      return;
    }
    if (settled.current || now - idleSince.current < SETTLE_IDLE_MS) return;
    settled.current = true;

    const exact = i / (count - 1);
    if (Math.abs(p - exact) > SETTLE_EPSILON * 4) goToRef.current(i);
  });

  useEffect(() => {
    if (staticMode) {
      lastIndex.current = -1;
      setIndex(0);
    }
  }, [staticMode]);

  const onKeyDown = (e) => {
    if (staticMode) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goTo(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(count - 1);
    }
  };

  // Swipe is read on touchend and never preventDefault()s, so a vertical drag
  // stays an ordinary page scroll and only a decisively horizontal one navigates.
  const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (staticMode || !touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goTo(index + (dx < 0 ? 1 : -1));
  };

  /* --------------------------------------------------- static fallback */
  if (staticMode) {
    return (
      <div>
        {panels.map((panel, i) => (
          <section
            key={panel.id}
            className={`relative overflow-hidden ${panel.groundClass} ${
              panel.dark ? "text-cream" : "text-graphite"
            }`}
          >
            {panel.textured && (
              <>
                <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-60" />
                <div aria-hidden="true" className="tex-fade pointer-events-none absolute inset-0" />
              </>
            )}
            <div className="relative mx-auto w-full max-w-5xl px-6 py-20 sm:px-10 sm:py-28">
              <div ref={(el) => (contentRefs.current[i] = el)}>{panel.render({ active: true })}</div>
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* --------------------------------------------------- pinned rail */
  return (
    <div ref={trackRef} style={{ height: `${count * 100}vh` }} className="relative">
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="sticky top-0 h-svh overflow-hidden bg-void"
      >
        <div
          ref={railRef}
          className="flex h-full"
          style={{ width: `${count * 100}%`, willChange: "transform" }}
        >
          {panels.map((panel, i) => (
            <div
              key={panel.id}
              /* Off-screen panels are inert: their controls stay out of the tab
                 order, so keyboard focus cannot land somewhere invisible. */
              inert={i !== index}
              aria-hidden={i !== index}
              className={`relative flex h-full items-center overflow-hidden ${panel.groundClass} ${
                panel.dark ? "text-cream" : "text-graphite"
              }`}
              style={{ width: `${100 / count}%` }}
            >
              {panel.textured && (
                <>
                  <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-60" />
                  <div aria-hidden="true" className="tex-fade pointer-events-none absolute inset-0" />
                </>
              )}
              <div className="relative mx-auto w-full max-w-5xl px-6 sm:px-10">
                <div ref={(el) => (contentRefs.current[i] = el)}>
                  {panel.render({ active: i === index })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Progress. Sits above the rail so it never moves with it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-5xl px-6 pb-7 sm:px-10">
            <div
              className={`flex items-center gap-5 ${
                panels[index]?.dark ? "text-cream" : "text-graphite"
              }`}
            >
              <span className="eyebrow tnum tabular-nums">
                {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              </span>

              <span
                className={`h-px flex-1 overflow-hidden ${
                  panels[index]?.dark ? "bg-cream/20" : "bg-graphite/20"
                }`}
              >
                <span
                  ref={progressRef}
                  className={`block h-px w-full origin-left ${
                    panels[index]?.dark ? "bg-electric" : "bg-graphite"
                  }`}
                  style={{ transform: "scaleX(0)" }}
                />
              </span>

              <div className="pointer-events-auto flex gap-2">
                {panels.map((panel, i) => (
                  <button
                    key={panel.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Go to ${panel.title}`}
                    aria-current={i === index}
                    className={`h-1.5 w-8 rounded-full transition-colors ${
                      i === index
                        ? "bg-electric"
                        : panels[index]?.dark
                          ? "bg-cream/25 hover:bg-cream/45"
                          : "bg-graphite/25 hover:bg-graphite/45"
                    }`}
                  />
                ))}
              </div>

              <span
                className={`eyebrow hidden sm:inline ${
                  panels[index]?.dark ? "text-cream-dim/60" : "text-graphite/45"
                }`}
              >
                {index === count - 1 ? "scroll on" : "scroll to advance"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
