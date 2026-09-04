import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { HeroAdjudication } from "../components/landing/HeroAdjudication";
import { HorizontalSequence } from "../components/landing/HorizontalSequence";
import { RoutingExplainer } from "../components/landing/RoutingExplainer";
import { RecoveryLoop } from "../components/landing/RecoveryLoop";
import { ActionLedger } from "../components/landing/ActionLedger";
import { ResultsPanel } from "../components/landing/ResultsPanel";
import { useInView } from "../components/landing/useInView";

/*
 * The ledger, on a dark desk.
 *
 * Two movements. Chapters 01-03 advance SIDEWAYS through a pinned rail -- the
 * argument told as a sequence. Chapters 04-08 stack vertically and share one
 * shell: number in the gutter, slash eyebrow, display heading, lede, then a
 * single bordered content region. Same rhythm every time, so the lower half
 * reads as one system rather than a pile of separately-built blocks.
 *
 * Colour discipline: approve / block / hold are the three policy verdicts and
 * nothing else may borrow them, which is why the accent is electric blue.
 */

/* ---------------------------------------------------------------- primitives */

const GROUND = {
  void: { cls: "bg-void", dark: true },
  voidSoft: { cls: "bg-void-soft", dark: true },
  cream: { cls: "bg-paper", dark: false },
  creamAlt: { cls: "bg-paper-alt", dark: false },
};

/** The one heading treatment. Every chapter and every rail panel uses it. */
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
function Panel({ dark, className = "", children }) {
  return (
    <div
      className={`rounded-sm p-6 sm:p-8 ${dark ? "glass" : "border border-rule bg-paper-hi"} ${className}`}
    >
      {children}
    </div>
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

/** The vertical chapter shell. Identical rhythm for every section below the rail. */
function Chapter({ index, eyebrow, title, lede, ground = "void", textured = false, children }) {
  const [ref, seen] = useInView();
  const g = GROUND[ground];
  return (
    <section
      className={`relative overflow-hidden border-t ${g.cls} ${
        g.dark ? "border-void-line/70 text-cream" : "border-rule text-graphite"
      }`}
    >
      {textured && (
        <>
          <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-60" />
          <div aria-hidden="true" className="tex-fade pointer-events-none absolute inset-0" />
        </>
      )}
      <div className="relative mx-auto w-full max-w-5xl px-6 py-20 sm:px-10 sm:py-24">
        <div ref={ref} className={seen ? "anim-rise" : "opacity-0"}>
          <Head index={index} eyebrow={eyebrow} title={title} lede={lede} dark={g.dark} />
          <div className="mt-12">{children}</div>
        </div>
      </div>
    </section>
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

/* The audit chain, as aligned rows -- the same figure treatment as every other
   table on the page. */
const TRAIL = [
  ["Classified", "failure type, confidence, and which classifier produced it"],
  ["Decided", "proposed action, confidence, reasoning, and which engine ran"],
  ["Routed", "why the router chose that engine, and when the LLM was used"],
  ["Checked", "every rule evaluated, and the verdict it returned"],
  ["Executed", "what actually ran, after policy — not what was proposed"],
  ["Observed", "the outcome recorded against the case"],
];

/* ------------------------------------------------------- horizontal chapters */

function RailPanel({ left, right }) {
  return (
    <div className="grid items-center gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

const CHAPTERS = [
  {
    id: "problem",
    title: "The problem",
    groundClass: "bg-void-soft",
    dark: true,
    textured: true,
    render: () => (
      <RailPanel
        left={
          <>
            <Head
              index="01"
              eyebrow="the problem"
              title="Chasing everything is how you lose money."
              dark
              size="sm"
              lede="A failed payment is not a lost customer. The card was declined, the bank timed out, the authentication did not complete — in most cases the person still wants to buy. The revenue is recoverable."
            />
            <Note dark>
              But chasing costs money. Every retry carries a gateway fee, every recovery email
              costs a send, every escalation costs a person&apos;s time. Most systems chase
              everything identically — which spends the same effort on both of these.
            </Note>
          </>
        }
        right={
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                amount: "₹200",
                history: "four prior failures",
                verdict: "Not worth pursuing",
                tone: "text-block",
              },
              {
                amount: "₹95,000",
                history: "never failed before",
                verdict: "Worth every rupee spent",
                tone: "text-approve",
              },
            ].map((c) => (
              <Panel dark key={c.amount}>
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
        }
      />
    ),
  },
  {
    id: "actions",
    title: "Six permitted actions",
    groundClass: "bg-paper",
    dark: false,
    render: () => (
      <RailPanel
        left={
          <Head
            index="02"
            eyebrow="the action space"
            title="Six permitted actions. Nothing else exists."
            size="sm"
            lede="The set is closed and priced. TRACE cannot invent an action, change an amount, move money, or contact a customer outside these paths — so the worst case is bounded by construction, not by hoping the model behaves."
          />
        }
        right={<ActionLedger />}
      />
    ),
  },
  {
    id: "policy",
    title: "Nine policy rules",
    groundClass: "bg-paper-alt",
    dark: false,
    render: () => (
      <RailPanel
        left={
          <>
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
                bank timeouts a sixty-minute window and refuses to chase them afterwards — chasing
                a reversed transaction contacts a customer about money they already have.
              </p>
            </div>
          </>
        }
        right={
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
        }
      />
    ),
  },
];

/* ---------------------------------------------------------------------- page */

export default function Landing() {
  return (
    <div className="landing-page min-h-screen bg-void text-cream antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-cream focus:px-3 focus:py-2 focus:text-sm focus:text-void focus:underline"
      >
        Skip to content
      </a>

      <header className="relative z-20 border-b border-void-line/70">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-5 sm:px-10">
          <div className="flex items-baseline gap-3">
            <span className="display text-2xl tracking-tight text-cream">TRACE</span>
            <span className="eyebrow hidden text-cream-dim/70 sm:inline">
              / transaction recovery agent
            </span>
          </div>
          <Link
            to="/dashboard"
            className="shrink-0 rounded-xs bg-electric px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-electric-deep"
          >
            Open the console
          </Link>
        </div>
      </header>

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        <div className="relative overflow-hidden bg-void">
          <div aria-hidden="true" className="tex-dots pointer-events-none absolute inset-0 opacity-70" />
          <div aria-hidden="true" className="tex-glow pointer-events-none absolute inset-0" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-void"
          />

          <div className="relative mx-auto w-full max-w-5xl px-6 pb-20 pt-14 sm:px-10 sm:pb-24 sm:pt-20">
            <div className="eyebrow anim-rise text-electric">
              / razorpay ai buildathon — track 03
            </div>

            <h1
              style={{ animationDelay: "90ms" }}
              className="display display-fade anim-rise mt-6 max-w-[16ch] text-[3.2rem] sm:text-[5.6rem]"
            >
              The money is not gone. <em className="italic">Chasing it</em> is what destroys it.
            </h1>

            <p
              style={{ animationDelay: "180ms" }}
              className="anim-rise mt-8 max-w-[54ch] text-[15px] leading-[1.8] text-cream-dim"
            >
              TRACE prices every failed payment, picks one of six permitted actions, and a
              deterministic policy layer can overrule it before anything executes. Below is a real
              adjudication from the running system — not an illustration.
            </p>

            <div className="mt-12">
              <HeroAdjudication />
            </div>

            <div className="eyebrow mt-14 flex items-center gap-4 text-cream-dim/50">
              <span>scroll</span>
              <span aria-hidden="true" className="h-px w-16 bg-cream-dim/30" />
            </div>
          </div>
        </div>

        {/* ----------------------------------------- 01–03, advancing sideways */}
        <HorizontalSequence panels={CHAPTERS} label="The argument, chapters 01 to 03" />

        {/* ----------------------------------------- 04–08, one vertical system */}
        <Chapter
          index="04"
          eyebrow="the loop"
          title="One loop, bounded at four iterations."
          ground="cream"
          lede="It reassesses after every outcome and it stops on its own. Scroll through a single case and watch the context change under it."
        >
          <RecoveryLoop />
        </Chapter>

        <Chapter
          index="05"
          eyebrow="two engines, one interface"
          title="Pay for thinking only where it changes the answer."
          ground="void"
          textured
          lede="A deterministic scoring engine runs on every case: free, instant, explainable. The LLM is called only when the heuristic is not trustworthy enough on its own — roughly 22% of live decisions. Move the controls and watch which engine takes the case, and why."
        >
          <RoutingExplainer />

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            <Panel dark>
              <h3 className="display text-xl text-cream">Deterministic on purpose</h3>
              <p className="mt-3 text-sm leading-relaxed text-cream-dim">
                The 300-case comparison below runs the heuristic engine only, with no network
                calls. Same seed, same dataset, same result every time. That reproducibility is
                what makes it evidence rather than an anecdote — an LLM in the loop would make the
                benchmark unrepeatable and therefore worthless as a claim.
              </p>
            </Panel>
            <Panel dark>
              <h3 className="display text-xl text-cream">The live path is routed</h3>
              <p className="mt-3 text-sm leading-relaxed text-cream-dim">
                Individually ingested cases use the router, so genuinely ambiguous ones reach the
                LLM. That is where the hero adjudication came from. The batch harness refuses a
                routed mode outright rather than letting it silently make the benchmark
                non-reproducible.
              </p>
            </Panel>
          </div>
        </Chapter>

        <Chapter
          index="06"
          eyebrow="measured results"
          title="The work correctly left undone."
          ground="cream"
          lede="300 synthetic failed payments run through TRACE and through a fixed-rule baseline on identical data. One row settles the argument."
        >
          <ResultsPanel />
        </Chapter>

        <Chapter
          index="07"
          eyebrow="the audit trail"
          title="Every step is on the record."
          ground="voidSoft"
          textured
          lede="Any case can be reconstructed afterwards. Each step below is appended to an immutable trail with its timestamp — a failed reasoning call is recorded as a failed reasoning call, never as a judgment the system did not make."
        >
          <Panel dark>
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
        </Chapter>

        <Chapter
          index="08"
          eyebrow="open the console"
          title="See it adjudicate a live case."
          ground="void"
          textured
          lede="The console carries the live recovery queue, the full policy configuration read directly from the running service, the TRACE-versus-baseline comparison, and a case investigation view that shows the complete audit trail for any payment."
        >
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2.5 rounded-xs bg-electric px-6 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_-16px_rgba(47,48,255,0.9)] transition-transform hover:-translate-y-0.5"
            >
              Open the console
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
            <Link
              to="/policy"
              className="inline-flex items-center border-b border-cream-dim/50 pb-0.5 text-sm font-medium text-cream transition-colors hover:border-electric hover:text-electric"
            >
              Read the policy rules
            </Link>
          </div>
        </Chapter>
      </main>

      <footer className="border-t border-void-line/70 bg-void">
        <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
          <p className="eyebrow text-cream-dim/50">
            / trace — transaction recovery agent with contextual evaluation
          </p>
        </div>
      </footer>
    </div>
  );
}
