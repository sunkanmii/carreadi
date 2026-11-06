"use client";
import { useText, displayValue } from "@/lib/useText";
import { clientLocale } from "@/lib/client/locale";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadHistory, load, scoreOf, type Saved } from "@/lib/client/store";
import { nextTask } from "@/lib/roadmap";

const ago = (iso?: string) => {
  const days = iso ? Math.floor((Date.now() - Date.parse(iso)) / 864e5) : NaN;
  if (!Number.isFinite(days)) return "";
  return new Intl.RelativeTimeFormat(clientLocale(), { numeric: "auto" }).format(-Math.max(0, days), "day");
};

/**
 * For returning visitors: their last check and next step, one tap from the roadmap. Checking
 * another job or a new CV stays right below, and earlier checks are kept in the history.
 */
export default function WelcomeBack() {
  const tr = useText();
  const [s, setS] = useState<Saved | null>(null);
  const [count, setCount] = useState(0);
  const [when, setWhen] = useState("");

  useEffect(() => {
    // Coming from "Re-check" in the history, or with a job link: they're starting a check, stay out of the way.
    const params = new URLSearchParams(window.location.search);
    if (params.has("job") || params.has("recheck")) return;
    const saved = load();
    if (!saved.analysis || !saved.roadmap) return;
    const history = loadHistory();
    setS(saved);
    setCount(history.length);
    setWhen(ago(history.find((e) => e.analysis.createdAt === saved.analysis!.createdAt)?.savedAt ?? saved.analysis.createdAt));
  }, []);

  if (!s?.analysis || !s.roadmap) return null;
  const score = scoreOf(s.analysis);
  const done = s.roadmap.tasks.filter((t) => t.done).length;
  const steps = s.roadmap.tasks.length;
  const next = nextTask(s.roadmap);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      aria-label={tr("Your last check")}
      className="mt-8 w-full max-w-xl rounded-2xl border border-accent/25 bg-white p-5 text-start shadow-[0_10px_30px_-18px_rgba(31,95,74,0.5)]"
    >
      <p className="text-xs font-medium text-accent">{tr("👋 Welcome back. Your last check{value0}", { value0: displayValue(when && ` · ${when}`) })}</p>
      <p className="mt-1 line-clamp-2 text-lg leading-snug font-semibold tracking-tight">
        {s.job ? `${s.job.title} · ${s.job.company}` : s.analysis.roleTitle}
      </p>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">{tr("{value0} of {value1} requirements shown", { value0: displayValue(score.shown), value1: displayValue(score.total) })}</span>
        {steps > 0 && (
          <span className="rounded-full bg-paper px-2.5 py-1 text-muted">{tr("Roadmap {value0}/{value1} done", { value0: displayValue(done), value1: displayValue(steps) })}</span>
        )}
        {s.analysis.preview && <span className="rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn">{tr("Free preview")}</span>}
      </div>

      {next && (
        <p className="mt-3 text-sm">
          <span className="text-muted">{tr("Next step: ")}</span>
          {next.title}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/results" className="btn">
          {done > 0 ? tr("Continue my roadmap →") : tr("Open my results →")}
        </Link>
        {count > 1 && (
          <Link href="/history" className="btn-ghost">{tr("All my checks ({value0})", { value0: displayValue(count) })}</Link>
        )}
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {tr("Want to check another job, or a new CV? Go ahead below. This one stays saved in your")}{" "}
        <Link href="/history" className="underline underline-offset-2">{tr("history")}</Link>.
      </p>
    </motion.section>
  );
}
