import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MotionConfig, motion, useScroll, useTransform } from "motion/react";
import { HeroAdjudication } from "../components/landing/HeroAdjudication";
import { Chapters } from "../components/landing/Chapters";
import { RoutingExplainer } from "../components/landing/RoutingExplainer";
import { RecoveryLoop } from "../components/landing/RecoveryLoop";
import { ActionLedger } from "../components/landing/ActionLedger";
import { ResultsPanel } from "../components/landing/ResultsPanel";
import {
  BorderBeam,
  EASE_OUT,
  Magnetic,
  Reveal,
  ScrollProgress,
  Spotlight,
  TextEffect,
  useParallax,
} from "../components/landing/motion";

/*
 * The ledger, on a dark desk.
 *
 * The argument is a deck of seven cards the reader turns by hand. It is one
 * ordinary section in the vertical flow: nothing pins, nothing is sticky, and
 * no component reads or alters scroll position. The page scrolls top to bottom
 * exactly as an unstyled document would.
 *
 * Colour discipline: approve / block / hold are the three policy verdicts and
 * nothing else may borrow them, which is why the accent is electric blue.
 */

/* ---------------------------------------------------------------- primitives */

/** The one heading treatment, used by every card and every chapter. */
function Head({ index, eyebrow, title, lede, dark, size = "lg" }) {
  return (
    <>
      <div className="flex items-baseline gap-4">
        {index && (
          <span
            aria-hidden="true"
            className={`eyebrow tnum ${dark ? "text-cream-dim/50" : "text-graphite/35"}`}
          >
            /{index}
          </span>
        )}
        {eyebrow && (
          <span className={`eyebrow ${dark ? "text-electric" : "text-graphite/45"}`}>
            / {eyebrow}
          </span>
        )}
      </div>
      <h2
        className={`display mt-5 ${
          size === "lg" ? "text-[2.4rem] sm:text-[3.4rem]" : "text-[2rem] sm:text-[2.6rem]"
        } ${dark ? "text-cream" : "text-graphite"}`}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={`mt-5 max-w-[58ch] text-[15px] leading-[1.75] ${
            dark ? "text-cream-dim" : "text-graphite/70"
          }`}
        >
          {lede}
        </p>
      )}
    </>
  );
}

/** The one content surface, matched on both grounds. */
function Panel({ dark, lift, className = "", children }) {
  return (
    <motion.div
      whileHover={lift ? { y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } } : undefined}
      className={`rounded-sm p-6 ${dark ? "glass" : "border border-rule bg-paper-hi"} ${
        lift ? "transition-colors hover:border-cream/30" : ""
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

function Note({ dark, children }) {
  return (
    <p
      className={`mt-6 max-w-[64ch] text-sm leading-relaxed ${
        dark ? "text-cream-dim/75" : "text-graphite/55"
      }`}
    >
      {children}
    </p>
  );
}

function Th({ children, align = "left", w }) {
  return (
    <th
      scope="col"
      style={w ? { width: w } : undefined}
      className={`border-b border-rule pb-2 text-xs font-medium text-graphite/50 ${
        align === "right" ? "pl-6 text-right" : "pr-6 text-left"
      } last:pr-0`}
    >
      {children}
    </th>
  );
}

const VERDICT = {
  APPROVED: "text-approve",
  BLOCKED: "text-block",
  "FLAGGED FOR REVIEW": "text-hold",
};

const RULES = [
  ["Case already recovered", "BLOCKED"],
  ["Case already stopped or expired", "BLOCKED"],
  ["Recovery window expired", "BLOCKED"],
  ["Maximum recovery attempts reached", "BLOCKED"],
  ["No remaining recovery opportunities", "BLOCKED"],
  ["Same action repeated beyond its limit", "BLOCKED"],
  ["Agent confidence below the floor", "FLAGGED FOR REVIEW"],
  ["High-value transaction stopped on the first attempt", "FLAGGED FOR REVIEW"],
  ["All checks passed", "APPROVED"],
];

const TRAIL = [
  ["Classified", "failure type, confidence, and which classifier produced it"],
  ["Decided", "proposed action, confidence, reasoning, and which engine ran"],
  ["Routed", "why the router chose that engine, and when the LLM was used"],
  ["Checked", "every rule evaluated, and the verdict it returned"],
  ["Executed", "what actually ran, after policy — not what was proposed"],
  ["Observed", "the outcome recorded against the case"],
];

/* ------------------------------------------------------------------- the deck */

const CARDS = [
  {
    id: "problem",
    title: "The problem",
    dark: true,
    render: () => (
      <div className="grid items-center gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <div>
          <Head
            index="01"
            eyebrow="the problem"
            title="Chasing everything is how you lose money."
            dark
            size="sm"
            lede="A failed payment is not a lost customer. The card was declined, the bank timed out, the authentication did not complete — in most cases the person still wants to buy. The revenue is recoverable."
          />
          <Note dark>
            But chasing costs money. Every retry carries a gateway fee, every recovery email costs
            a send, every escalation costs a person&apos;s time. Most systems chase everything
            identically — which spends the same effort on both of these.
          </Note>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { amount: "₹200", history: "four prior failures", verdict: "Not worth pursuing", tone: "text-block" },
            { amount: "₹95,000", history: "never failed before", verdict: "Worth every rupee spent", tone: "text-approve" },
          ].map((c) => (
            <Panel dark lift key={c.amount}>
              <div className="tnum display text-4xl text-cream">{c.amount}</div>
              <div className="mt-2 text-sm text-cream-dim">{c.history}</div>
              <div className="mt-6 border-t border-cream/15 pt-4">
                <div className="eyebrow text-cream-dim/50">/ correct call</div>
                <div className={`mt-1.5 text-sm font-semibold ${c.tone}`}>{c.verdict}</div>
              </div>
            </Panel>
          ))}
          <p className="text-sm leading-relaxed text-cream-dim/75 sm:col-span-2">
            A fixed-rule system spends identically on both. Indiscriminate chasing does not just
            waste effort — it destroys the value it is trying to recover.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "actions",
    title: "Six permitted actions",
    dark: false,
    render: () => (
      <div className="grid items-center gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <Head
          index="02"
          eyebrow="the action space"
          title="Six permitted actions. Nothing else exists."
          size="sm"
          lede="The set is closed and priced. TRACE cannot invent an action, change an amount, move money, or contact a customer outside these paths — so the worst case is bounded by construction, not by hoping the model behaves."
        />
        <ActionLedger />
      </div>
    ),
  },
  {
    id: "policy",
    title: "Nine policy rules",
    dark: false,
    render: () => (
      <div className="grid items-center gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <div>
          <Head
            index="03"
            eyebrow="the control layer"
            title="Agent decides. Policy controls."
            size="sm"
            lede="Deterministic, with no dependency on the agent. It behaves identically no matter what produced the proposal — which is what makes the safety properties verifiable independently of the AI."
          />
          <div className="mt-8 border-l-2 border-graphite pl-5">
            <h3 className="display text-xl">A regulator writes one of the rules</h3>
            <p className="mt-2 text-sm leading-relaxed text-graphite/70">
              NPCI mandates auto-reversal of most failed UPI transactions within roughly sixty
              minutes. Past that window the money is already back with the customer. TRACE gives
              bank timeouts a sixty-minute window and refuses to chase them afterwards — chasing a
              reversed transaction contacts a customer about money they already have.
            </p>
          </div>
        </div>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th w="10%">Rule</Th>
              <Th>Condition</Th>
              <Th align="right" w="30%">
                Verdict
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {RULES.map(([cond, verdict], i) => (
              <tr key={cond}>
                <td className="tnum py-2.5 pr-6 text-sm text-graphite/40">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="py-2.5 pr-6 text-sm text-graphite/75">{cond}</td>
                <td className={`py-2.5 pl-6 text-right text-xs font-semibold ${VERDICT[verdict]}`}>
                  {verdict}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "loop",
    title: "The recovery loop",
    dark: false,
    render: () => (
      <div>
        <Head
          index="04"
          eyebrow="the loop"
          title="One loop, bounded at four iterations."
          size="sm"
          lede="It reassesses after every outcome and it stops on its own. Watch a single case run and the context change under it."
        />
        <div className="mt-10">
          <RecoveryLoop />
        </div>
      </div>
    ),
  },
  {
    id: "engines",
    title: "Two engines",
    dark: true,
    render: () => (
      <div>
        <Head
          index="05"
          eyebrow="two engines, one interface"
          title="Pay for thinking only where it changes the answer."
          dark
          size="sm"
          lede="A deterministic scoring engine runs on every case: free, instant, explainable. The LLM is called only when the heuristic is not trustworthy enough on its own — roughly 22% of live decisions. Move the controls and watch which engine takes the case, and why."
        />
        <div className="mt-10">
          <RoutingExplainer />
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <Panel dark>
            <h3 className="display text-xl text-cream">Deterministic on purpose</h3>
            <p className="mt-3 text-sm leading-relaxed text-cream-dim">
              The 300-case comparison runs the heuristic engine only, with no network calls. Same
              seed, same dataset, same result every time — reproducibility is what makes it
              evidence rather than an anecdote.
            </p>
          </Panel>
          <Panel dark>
            <h3 className="display text-xl text-cream">The live path is routed</h3>
            <p className="mt-3 text-sm leading-relaxed text-cream-dim">
              Individually ingested cases use the router, so genuinely ambiguous ones reach the
              LLM. That is where the hero adjudication came from. The batch harness refuses a
              routed mode outright.
            </p>
          </Panel>
        </div>
      </div>
    ),
  },
  {
    id: "results",
    title: "Measured results",
    dark: false,
    render: () => (
      <div>
        <Head
          index="06"
          eyebrow="measured results"
          title="The work correctly left undone."
          size="sm"
          lede="300 synthetic failed payments run through TRACE and through a fixed-rule baseline on identical data. One row settles the argument."
        />
        <div className="mt-10">
          <ResultsPanel />
        </div>
      </div>
    ),
  },
  {
    id: "audit",
    title: "The audit trail",
    dark: true,
    render: () => (
      <div>
        <Head
          index="07"
          eyebrow="the audit trail"
          title="Every step is on the record."
          dark
          size="sm"
          lede="Any case can be reconstructed afterwards. Each step below is appended to an immutable trail with its timestamp — a failed reasoning call is recorded as a failed reasoning call, never as a judgment the system did not make."
        />
        <Panel dark className="mt-10">
          <ul className="divide-y divide-cream/10">
            {TRAIL.map(([step, detail], i) => (
              <li
                key={step}
                className="grid gap-x-6 gap-y-1 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[3rem_9rem_minmax(0,1fr)]"
              >
                <span aria-hidden="true" className="eyebrow tnum text-cream-dim/40">
                  /{String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-cream">{step}</span>
                <span className="text-sm leading-relaxed text-cream-dim">{detail}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Note dark>
          The trail is append-only. Nothing in it is rewritten when a later iteration changes the
          case, which is what lets a reviewer reconstruct what was known at each decision rather
          than only how the case ended.
        </Note>
      </div>
    ),
  },
];

/* ---------------------------------------------------------------------- page */

/** Transparent over the hero; frosts over as soon as the page moves under it. */
function Header() {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 80], ["rgba(14, 11, 8, 0)", "rgba(14, 11, 8, 0.72)"]);
  const line = useTransform(scrollY, [0, 80], ["rgba(44, 35, 24, 0.35)", "rgba(44, 35, 24, 0.9)"]);
  const blur = useTransform(scrollY, [0, 80], ["blur(0px)", "blur(14px)"]);

  return (
    <motion.header
      style={{ backgroundColor: bg, borderColor: line, backdropFilter: blur, WebkitBackdropFilter: blur }}
      className="sticky top-0 z-40 border-b"
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-4 sm:px-10">
        <div className="flex items-baseline gap-3">
          <span className="display text-2xl tracking-tight text-cream">TRACE</span>
          <span className="eyebrow hidden text-cream-dim/70 sm:inline">
            / transaction recovery agent with contextual evaluation
          </span>
        </div>
        <Magnetic strength={0.2}>
          <Link
            to="/dashboard"
            className="btn-shine block shrink-0 whitespace-nowrap rounded-xs bg-electric px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-electric-deep"
          >
            Open the console
          </Link>
        </Magnetic>
      </div>
    </motion.header>
  );
}

export default function Landing() {
  const heroRef = useRef(null);
  const { y: glowY, opacity: glowOpacity } = useParallax(heroRef, 160);
  const { y: dotsY } = useParallax(heroRef, 60);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing-page min-h-screen bg-void text-cream antialiased">
        <ScrollProgress />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-cream focus:px-3 focus:py-2 focus:text-sm focus:text-void focus:underline"
        >
          Skip to content
        </a>

        <Header />

        <main id="main">
          {/* ------------------------------------------------------------ hero */}
          <div ref={heroRef} className="relative overflow-hidden bg-void">
            <motion.div
              aria-hidden="true"
              style={{ y: dotsY }}
              className="tex-dots pointer-events-none absolute -inset-y-20 inset-x-0 opacity-70"
            />
            <motion.div
              aria-hidden="true"
              style={{ y: glowY, opacity: glowOpacity }}
              className="tex-glow pointer-events-none absolute inset-0"
            />
            <motion.div
              aria-hidden="true"
              className="hero-orb pointer-events-none absolute -right-32 -top-40 h-[34rem] w-[34rem] rounded-full"
              animate={{ x: [0, -40, 20, 0], y: [0, 30, -20, 0], scale: [1, 1.08, 0.96, 1] }}
              transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            />
            <Spotlight />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-void"
            />

            <div className="relative mx-auto w-full max-w-5xl px-6 pb-20 pt-14 sm:px-10 sm:pb-24 sm:pt-20">
              <TextEffect
                as="h1"
                delay={0.15}
                className="display max-w-[16ch] text-[3.2rem] text-cream sm:text-[5.6rem]"
              >
                {"The money is not gone. "}
                <em className="italic text-electric-bright">Chasing it</em>
                {" is what destroys it."}
              </TextEffect>

              <motion.p
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.75 }}
                className="mt-8 max-w-[54ch] text-[15px] leading-[1.8] text-cream-dim"
              >
                TRACE prices every failed payment, picks one of six permitted actions, and a
                deterministic policy layer can overrule it before anything executes. Below is a real
                adjudication from the running system — not an illustration.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 1, ease: EASE_OUT, delay: 0.95 }}
                className="relative mt-12"
              >
                <HeroAdjudication />
              </motion.div>
            </div>
          </div>

          {/* --------------------------------------- the deck: chapters 01–07 */}
          {/* overflow-clip, not -hidden: a hidden overflow would become the
              chapter index's scroll container and stop it sticking. */}
          <section className="relative overflow-clip border-t border-void-line/70 bg-void-soft">
            <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative mx-auto w-full max-w-6xl px-6 py-20 sm:px-10 sm:py-24">
              <Chapters
                cards={CARDS}
                heading={
                  <Reveal className="mb-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <h2 className="display text-[2rem] text-cream sm:text-[2.6rem]">The argument</h2>
                    <span className="eyebrow text-cream-dim/60">/ seven chapters, one argument</span>
                  </Reveal>
                }
              />
            </div>
          </section>

          {/* --------------------------------------------------------- 08 CTA */}
          <section className="relative overflow-hidden border-t border-void-line/70 bg-void">
            <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-70" />
            <div aria-hidden="true" className="tex-glow pointer-events-none absolute inset-0" />
            <Spotlight size={640} />
            <div className="relative mx-auto w-full max-w-5xl px-6 py-20 sm:px-10 sm:py-24">
              <Reveal>
                <Head
                  index="08"
                  eyebrow="open the console"
                  title="See it adjudicate a live case."
                  dark
                  lede="The console carries the live recovery queue, the full policy configuration read directly from the running service, the TRACE-versus-baseline comparison, and a case investigation view that shows the complete audit trail for any payment."
                />
              </Reveal>
              <Reveal delay={0.15} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <Magnetic>
                  <Link
                    to="/dashboard"
                    className="btn-shine group relative inline-flex items-center gap-2.5 rounded-xs bg-electric px-6 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_-16px_rgba(47,48,255,0.9)] transition-shadow hover:shadow-[0_20px_50px_-12px_rgba(47,48,255,1)]"
                  >
                    <BorderBeam duration={4} />
                    Open the console
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                      strokeWidth={2}
                    />
                  </Link>
                </Magnetic>
                <Link
                  to="/policy"
                  className="link-draw inline-flex items-center pb-0.5 text-sm font-medium text-cream transition-colors hover:text-electric-bright"
                >
                  Read the policy rules
                </Link>
              </Reveal>
            </div>
          </section>
        </main>

        <footer className="border-t border-void-line/70 bg-void">
          <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
            <p className="eyebrow text-cream-dim/50">
              / trace — transaction recovery agent with contextual evaluation
            </p>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
