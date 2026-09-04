import { useEffect, useRef, useState } from "react";

/**
 * Fires once when an element scrolls into view.
 *
 * IntersectionObserver rather than a scroll handler: no listener runs on every
 * frame, so there is nothing to thrash layout on a mid-range phone. Disconnects
 * itself after the first hit — these are one-shot reveals, not sticky state.
 *
 * Returns true immediately when the observer is unavailable, so content is
 * never left hidden by a capability gap.
 */
export function useInView(options) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [seen, setSeen] = useState(false);
  const delivered = useRef(false);

  useEffect(() => {
    // No motion wanted means no scroll-gating either: the content is simply
    // there, rather than waiting on a reveal that will not play.
    if (reduced) {
      setSeen(true);
      return undefined;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        delivered.current = true;
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-12% 0px -12% 0px", threshold: 0.01, ...options }
    );
    observer.observe(node);

    // A working observer always delivers an initial entry, intersecting or not.
    // If none arrives the environment is not running the observer at all (a
    // frozen tab, a screenshotter, a crawler) -- reveal everything rather than
    // leave the reader a blank page. Callers gate content on this.
    const failsafe = setTimeout(() => {
      if (!delivered.current) setSeen(true);
    }, 1200);

    return () => {
      clearTimeout(failsafe);
      observer.disconnect();
    };
  }, [options, reduced]);

  return [ref, seen];
}

/** True when the visitor has asked for reduced motion. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Counts from 0 to `value` once `active` is true. Driven by requestAnimationFrame
 * so it never fights the scroll thread; jumps straight to the value when motion
 * is reduced.
 */
export function useCountUp(value, active, { duration = 1100, reduced = false } = {}) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    if (reduced || duration === 0) {
      setN(value);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic: fast commitment, gentle settle.
      setN(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, duration, reduced]);

  return n;
}
