import { useEffect, useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

/*
 * Landing motion primitives, in the manner of Motion Primitives.
 *
 * Every primitive animates transform, opacity or filter only -- nothing that
 * forces layout -- and every one ends on the resting state, so the page under
 * MotionConfig reducedMotion="user" is complete without a single frame played.
 */

export const EASE_OUT = [0.22, 1, 0.36, 1];
export const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 };

/**
 * Text that resolves word by word out of a soft blur. Children may mix strings
 * and elements; strings are split into words, elements animate as one unit, so
 * an <em> inside a headline keeps its styling.
 */
export function TextEffect({ as = "p", children, className, style, delay = 0, stagger = 0.045 }) {
  const Tag = motion[as];
  const parts = [];
  const push = (node, key) =>
    parts.push(
      <motion.span
        key={key}
        className="inline-block whitespace-pre"
        variants={{
          hidden: { opacity: 0, y: "0.35em", filter: "blur(10px)" },
          visible: {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            transition: { duration: 0.7, ease: EASE_OUT },
            transitionEnd: { filter: "none" },
          },
        }}
      >
        {node}
      </motion.span>
    );

  [].concat(children).forEach((child, ci) => {
    if (typeof child === "string") {
      child
        .split(/(\s+)/)
        .filter(Boolean)
        .forEach((w, wi) => (/^\s+$/.test(w) ? parts.push(w) : push(w, `${ci}-${wi}`)));
    } else if (child != null) {
      push(child, `${ci}-el`);
    }
  });

  return (
    <Tag
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
    >
      {parts}
    </Tag>
  );
}

/** Rises into place out of a blur once it scrolls into view. Fires once. */
export function Reveal({ children, className, delay = 0, y = 24, as = "div" }) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
    >
      {children}
    </Tag>
  );
}

/**
 * Pulls its child a little way toward the pointer and springs back on leave.
 * Pointer-only: touch never triggers mouse movement, so phones see a plain link.
 */
export function Magnetic({ children, strength = 0.28, className = "inline-block" }) {
  const ref = useRef(null);
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.5 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.5 });

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div ref={ref} className={className} style={{ x, y }} onMouseMove={onMove} onMouseLeave={reset}>
      {children}
    </motion.div>
  );
}

/**
 * A soft pool of light that trails the pointer across its parent. The parent
 * must be `relative`; this sits behind the content and never takes pointer
 * events, so it costs nothing but a transform per frame.
 */
export function Spotlight({ size = 520, color = "rgba(47, 48, 255, 0.18)" }) {
  const mx = useMotionValue(-size);
  const my = useMotionValue(-size);
  const sx = useSpring(mx, { stiffness: 120, damping: 22 });
  const sy = useSpring(my, { stiffness: 120, damping: 22 });
  const bg = useMotionTemplate`radial-gradient(${size / 2}px circle at ${sx}px ${sy}px, ${color}, transparent 70%)`;
  const ref = useRef(null);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return undefined;
    const move = (e) => {
      if (e.pointerType !== "mouse") return;
      const r = host.getBoundingClientRect();
      mx.set(e.clientX - r.left);
      my.set(e.clientY - r.top);
    };
    const leave = () => {
      mx.set(-size);
      my.set(-size);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [mx, my, size]);

  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ background: bg }}
    />
  );
}

/** A hairline across the top of the viewport that fills as the page is read. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 34, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-electric"
      style={{ scaleX }}
    />
  );
}

/** Parallax drift for decorative layers, keyed to how far the target has scrolled. */
export function useParallax(ref, distance = 120) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, distance]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.2]);
  return { y, opacity };
}

/** A border light that travels the edge of its `relative overflow-hidden` parent. */
export function BorderBeam({ duration = 6, className = "" }) {
  return (
    <span aria-hidden="true" className={`border-beam pointer-events-none absolute inset-0 rounded-[inherit] ${className}`}>
      <motion.span
        className="border-beam-dot"
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      />
    </span>
  );
}
