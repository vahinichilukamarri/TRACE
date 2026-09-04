import { useEffect, useRef } from "react";

/**
 * Reports how far the page has scrolled through `trackRef`, as 0..1.
 *
 * Deliberately does NOT listen for `scroll` events. Scroll delivery is coalesced
 * and, on momentum scrolling and while a smooth/snapped scroll is animating, can
 * go quiet for long stretches -- which strands anything driven by it mid-way.
 * Instead a requestAnimationFrame loop samples the track's position each frame.
 * It starts immediately and is only PAUSED by an IntersectionObserver leaving
 * view or the tab being hidden, so nothing can prevent it from running.
 *
 * Cost is one getBoundingClientRect per frame while a pinned section is on
 * screen. Both callers refuse to pin below tablet size, so phones never pay it.
 *
 * The callback does the writing. It must only set transforms/opacity and never
 * read layout, or this becomes a layout-thrash loop.
 */
export function useTrackProgress(trackRef, enabled, onProgress) {
  const cb = useRef(onProgress);
  // Kept current in an effect rather than during render: the loop always calls
  // the latest callback, without touching a ref while rendering.
  useEffect(() => {
    cb.current = onProgress;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const track = trackRef.current;
    if (!track) return undefined;

    let raf = 0;
    let running = false;

    const measure = () => {
      const rect = track.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel > 0 ? -rect.top / travel : 0;
      cb.current(p < 0 ? 0 : p > 1 ? 1 : p);
    };

    const tick = () => {
      measure();
      if (running) raf = requestAnimationFrame(tick);
    };
    // Always re-arms. An early-return on `running` cannot recover if the very
    // first frame is never delivered -- the flag stays true and the loop is dead
    // for the session.
    const start = () => {
      running = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      // Settle on the true end state rather than wherever the last frame landed.
      measure();
    };

    // Start optimistically. The observer below is an OPTIMISATION that may pause
    // the loop -- never a precondition for it running. Gating the start on it
    // means any environment that delivers no observer callback (a frozen tab, a
    // screenshotter, an old engine) strands the animation permanently, which is
    // exactly the failure this hook exists to remove.
    measure();
    start();

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    let io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) start();
          else stop();
        },
        { rootMargin: "25% 0px 25% 0px" }
      );
      io.observe(track);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (io) io.disconnect();
      stop();
    };
  }, [trackRef, enabled]);
}
