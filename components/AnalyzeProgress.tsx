"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

// What the analysis is doing, by elapsed seconds. Timed to the usual 30–45 s run.
const STAGES = [
  { at: 0, label: "Reading your CV" },
  { at: 4, label: "Reading the job post" },
  { at: 9, label: "Checking each requirement against your CV" },
  { at: 22, label: "Double-checking every quote is really in your CV" },
  { at: 32, label: "Building your step-by-step plan" },
  { at: 50, label: "Taking a little longer than usual. Almost there" },
];

/**
 * Shown while an analysis runs: live stages, a progress bar and elapsed time, plus a clear
 * "keep this page open" warning. Leaving mid-run asks the browser to confirm first.
 */
export default function AnalyzeProgress({ reconnecting }: { reconnecting: boolean }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    const title = document.title;
    document.title = "Analyzing… · Carreadi";
    // A refresh or close would throw the run away: ask first.
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(tick);
      document.title = title;
      window.removeEventListener("beforeunload", warn);
    };
  }, [reconnecting]);

  const stage = [...STAGES].reverse().find((s) => seconds >= s.at)!;
  const index = STAGES.indexOf(stage);
  // Eases towards 95% over about 45 s; it only reaches 100% when the results arrive.
  const pct = Math.min(95, Math.round(95 * (1 - Math.exp(-seconds / 18))));

  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-accent/25 bg-accent-soft/60 p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={reconnecting ? "re" : stage.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="font-medium text-ink"
          >
            {reconnecting ? "Picking up where you left off" : stage.label}…
          </motion.p>
        </AnimatePresence>
        <span className="shrink-0 tabular-nums text-muted">{seconds}s</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${pct}%` }} transition={{ ease: "easeOut", duration: 0.6 }} />
      </div>

      <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
        {STAGES.slice(0, 5).map((s, i) => (
          <li key={s.label} className={`h-1 rounded-full transition-colors duration-500 ${i <= index ? "bg-accent" : "bg-white"}`} />
        ))}
      </ol>

      <p className="mt-3 text-sm font-medium text-warn">⚠️ Keep this page open. Don&rsquo;t refresh or close it.</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {reconnecting
          ? "Your connection dropped while you were away, so we started again. This doesn't use another free check."
          : "This usually takes 30–45 seconds. If you switch apps, come back to this tab and it will carry on without using another free check."}
      </p>
    </div>
  );
}
