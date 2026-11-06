"use client";
import { useText, displayValue } from "@/lib/useText";
import { rovingKeys } from "@/lib/client/keyboard";
import { useLocale } from "next-intl";
import { LANGUAGE_NAMES, isLocale } from "@/lib/i18n";
import { localizeReason } from "@/lib/localizeReason";


import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Finding } from "@/lib/analysis/schema";
import { skillsIn } from "@/lib/careers";
import { track } from "@/lib/client/analytics";
import { api, postJson } from "@/lib/client/http";
import { safeHref } from "@/lib/url";
import { getPass } from "@/lib/client/pass";
import { currentEntry, load, save, scoreOf, type Saved } from "@/lib/client/store";
import type { Recommendation, Tier } from "@/lib/recommend";
import { nextTask, type Roadmap } from "@/lib/roadmap";
import ExportMenu from "./ExportMenu";
import JobCard from "./JobCard";
import RoadmapView from "./RoadmapView";
import Unlock from "./Unlock";
import { Spinner } from "./Analyzer";

const rise = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };
const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

type Tab = "gaps" | "roadmap" | "jobs";

export default function Results() {
  const tr = useText();
  const locale = useLocale();
  const [data, setData] = useState<Saved | null>(null);
  const [tab, setTab] = useState<Tab>("gaps");

  useEffect(() => setData(load()), []);

  if (!data) return <div className="py-24 text-center text-sm text-muted">{tr("Loading…")}</div>;
  if (!data.analysis || !data.roadmap)
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium">{tr("No roadmap yet")}</p>
        <p className="mt-1 text-sm text-muted">{tr("Upload your résumé and a job to get one.")}</p>
        <Link href="/" className="btn mt-6">{tr("Start")}</Link>
      </div>
    );

  const a = data.analysis;
  const reportLocale = a.locale ?? "en";
  const roadmap = data.roadmap;
  const next = nextTask(roadmap);
  const updateRoadmap = (r: Roadmap) => setData(save({ roadmap: { ...r, updatedAt: new Date().toISOString() } }));

  return (
    // Honours the OS "reduce motion" setting for every animation below.
    <MotionConfig reducedMotion="user">
      {/* Results quote the résumé: masked in session replays and excluded from click autocapture. */}
      <div className="ph-mask ph-no-capture mx-auto w-full max-w-2xl py-8">
        <motion.p {...rise} transition={spring} className="text-xs font-medium tracking-wide text-muted uppercase">{tr("Readiness for")}</motion.p>
        <motion.h1 dir="auto" {...rise} transition={{ ...spring, delay: 0.05 }} className="mt-1 text-2xl font-semibold tracking-tight text-balance">
          {data.job ? `${data.job.title} · ${data.job.company}` : a.roleTitle}
        </motion.h1>
        <motion.p {...rise} transition={{ ...spring, delay: 0.1 }} className="mt-3 text-[15px] leading-relaxed text-muted">
          {a.preview ? tr("Here’s what your CV already proves for this job, one thing holding you back, and your first step to fix it. Every other gap, and the full plan, unlock with a pass.") : <span lang={reportLocale} dir="auto">{a.summary}</span>}
        </motion.p>
        {locale !== reportLocale && <p className="mt-2 text-xs text-muted">{tr("Saved report language: {language}. New analyses use your selected website language.", { language: LANGUAGE_NAMES[isLocale(reportLocale) ? reportLocale : "en"] })}</p>}

        <Progress analysis={a} />

        <AnimatePresence mode="wait">
          {next && (
            <motion.button
              key={next.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: 0.15 } }}
              exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.15 } }}
              whileHover={{ y: -2 }}
              onClick={() => setTab("roadmap")}
              className="mt-6 block w-full rounded-2xl bg-accent-soft p-4 text-start"
            >
              <p className="flex items-center gap-2 text-xs font-medium text-accent">
                <motion.span className="size-1.5 rounded-full bg-accent" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
                {tr("Next step")}</p>
              <p className="mt-1 font-medium">{next.title}</p>
              <p className="mt-1 text-sm text-muted">{tr("Deliverable: {value0}", { value0: displayValue(next.deliverable) })}</p>
            </motion.button>
          )}
        </AnimatePresence>

        <motion.div {...rise} transition={{ ...spring, delay: 0.2 }} className="mt-6 flex flex-wrap items-start gap-2">
          <Link href="/" className="btn-ghost">{tr("Re-check with updated résumé")}</Link>
          <ExportMenu data={data} />
          {data.job?.applyUrl && (
            <a href={safeHref(data.job.applyUrl)} target="_blank" rel="noopener noreferrer" className="btn-ghost" onClick={() => track("application_opened", { from: "results" })}>{tr("Open application ↗")}</a>
          )}
        </motion.div>

        <div role="tablist" aria-label={tr("Report sections")} onKeyDown={rovingKeys} className="mt-8 flex gap-6 border-b border-line text-sm">
          {(["gaps", "roadmap", "jobs"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              id={`result-tab-${t}`}
              aria-controls="result-panel"
              tabIndex={tab === t ? 0 : -1}
              aria-selected={tab === t}
              onClick={() => { setTab(t); track("results_tab", { tab: t }); }}
              className={tr("relative pb-2.5 capitalize transition-colors {value0}", { value0: displayValue(tab === t ? "font-medium" : "text-muted hover:text-ink") })}
            >
              {t === "gaps" ? tr("Evidence") : t === "roadmap" ? tr("Roadmap") : tr("Jobs")}
              {tab === t && <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" transition={spring} />}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            role="tabpanel"
            id="result-panel"
            aria-labelledby={`result-tab-${tab}`}
            tabIndex={0}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="py-6"
          >
            {tab === "gaps" && (
              <>
                {a.findings.length > 0 ? (
                  <Evidence findings={a.findings} locale={reportLocale} />
                ) : (
                  <p className="text-sm text-muted">{tr("Your CV doesn’t clearly show this job’s requirements yet.")}</p>
                )}
                {a.preview && <Unlock locked={a.preview.locked} onUnlocked={() => setData(load())} />}
              </>
            )}
            {tab === "roadmap" && (
              <>
                {/* A free preview's roadmap has the one step for its one gap; the rest unlocks with a pass. */}
                <RoadmapView roadmap={roadmap} onChange={updateRoadmap} locale={reportLocale} />
                {a.preview && <Unlock locked={a.preview.locked} onUnlocked={() => setData(load())} />}
              </>
            )}
            {tab === "jobs" && <Recommendations data={data} />}
          </motion.div>
        </AnimatePresence>

        <p className="text-xs text-muted">{tr("AI output, checked against your résumé text. Not a prediction of hiring outcomes.")}</p>
      </div>
    </MotionConfig>
  );
}

const STATUS: Record<Finding["status"], { label: string; cls: string }> = {
  demonstrated: { label: "Shown", cls: "bg-accent-soft text-accent" },
  not_shown: { label: "Not shown yet", cls: "bg-warn-soft text-warn" },
  missing: { label: "Missing", cls: "bg-bad-soft text-bad" },
  uncertain: { label: "Unclear", cls: "bg-paper text-muted" },
  eligibility: { label: "Eligibility", cls: "bg-bad-soft text-bad" },
};
const ORDER: Finding["status"][] = ["eligibility", "missing", "not_shown", "uncertain", "demonstrated"];

function Evidence({ findings, locale }: { findings: Finding[]; locale: string }) {
  const tr = useText();
  const sorted = [...findings].sort((x, y) => ORDER.indexOf(x.status) - ORDER.indexOf(y.status) || x.priority - y.priority);
  const counts = ORDER.map((s) => [s, findings.filter((f) => f.status === s).length] as const).filter(([, n]) => n);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {counts.map(([s, n], i) => (
          <motion.span
            key={s}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: i * 0.06 }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[s].cls}`}
          >
            {n} {tr(STATUS[s].label)}
          </motion.span>
        ))}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {sorted.map((f, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.1 + Math.min(i, 10) * 0.04 }}>
            <details className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span lang={locale} dir="auto" className="text-sm font-medium">{f.requirement}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[f.status].cls}`}>{tr(STATUS[f.status].label)}</span>
              </summary>
              <dl className="mt-3 space-y-2 text-sm">
                <Row k="Evidence">{f.evidence ? <q dir="auto" className="italic">{f.evidence}</q> : <span className="text-muted">{tr("None found in your résumé")}</span>}</Row>
                <Row k="Importance">{tr("{value0} · priority {value1}", { value0: displayValue(f.importance === "bonus" ? tr("Nice to have") : f.importance === "required" ? tr("Required") : tr("Preferred")), value1: displayValue(f.priority) })}</Row>
                {f.status !== "demonstrated" && !f.action && (
                  <Row k="Next steps">
                    <span className="text-muted">{tr("🔒 Steps, deliverable and resources unlock with a pass")}</span>
                  </Row>
                )}
                {f.status !== "demonstrated" && !!f.action && (
                  <>
                    <Row k="Do"><span lang={locale} dir="auto">{f.action}</span></Row>
                    <Row k="Deliverable"><span lang={locale} dir="auto">{f.deliverable}</span></Row>
                    <Row k="Learn">
                      <a href={safeHref(f.resource.url)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{tr("{value0} ↗", { value0: displayValue(f.resource.name) })}</a>
                    </Row>
                  </>
                )}
              </dl>
            </details>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/** "Last check: 3 of 7 → now 5 of 7", when this job was checked before. */
function Progress({ analysis }: { analysis: Saved["analysis"] }) {
  const tr = useText();
  const [prev, setPrev] = useState<{ shown: number; total: number; at: string } | undefined>();
  useEffect(() => setPrev(currentEntry()?.previous), [analysis]);
  if (!prev || !analysis) return null;
  const now = scoreOf(analysis);
  const gained = now.shown - prev.shown;
  return (
    <motion.p {...rise} transition={{ ...spring, delay: 0.12 }} className={`mt-4 rounded-xl px-3 py-2 text-sm ${gained > 0 ? "bg-accent-soft text-accent" : "bg-paper text-muted"}`}>
      {gained > 0 ? "🎉 " : ""}{tr("Last check: ")}{prev.shown} {tr(" of ")}{prev.total} {tr(" shown → now ")}<b>{tr("{value0} of {value1}", { value0: displayValue(now.shown), value1: displayValue(now.total) })}</b>
      {gained > 0 ? `. ${gained} more requirement${gained === 1 ? "" : "s"} proven.` : "."}{" "}
      <Link href="/history" className="underline underline-offset-2">{tr("See history")}</Link>
    </motion.p>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  const tr = useText();
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(88px,auto)_1fr] sm:gap-2">
      <dt className="text-muted">{tr(k)}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const TIERS: Record<Tier, { label: string; hint: string }> = {
  apply: { label: "Worth applying to now", hint: "Your résumé shows most skills we found in the posting, and location/work style fit." },
  review: { label: "Worth reviewing", hint: "Partial skill overlap. Read the posting and decide." },
  future: { label: "Good future target", hint: "Matches your path, but key skills aren't shown yet. Use your roadmap." },
};

function Recommendations({ data }: { data: Saved }) {
  const tr = useText();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [lockedJobs, setLockedJobs] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ recommendations: Recommendation[]; locked: number }>(
      "/api/recommend",
      postJson({
        passToken: getPass()?.token,
        // Same skill reading as the home page, plus anything the AI verified, so counts match everywhere.
        skills: [...new Set([...(data.analysis?.demonstratedSkills ?? []), ...skillsIn(data.resumeText ?? "")])],
        careerPath: data.prefs?.careerPath || undefined,
        location: data.prefs?.location || undefined,
        remote: data.prefs?.remote,
        sources: data.sources,
      }),
    )
      .then((d) => {
        setRecs(d.recommendations);
        setLockedJobs(d.locked);
      })
      .catch(() => setError(tr("Couldn't load jobs right now. Try again shortly.")));
  }, [data]);

  if (error) return <p role="alert" className="text-sm text-bad">{tr(error)}</p>;
  if (!recs) return <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> {tr(" Checking live jobs…")}</p>;
  if (!recs.length)
    return (
      <p className="py-8 text-center text-sm text-muted">
        {tr("No matching live jobs on our boards. ")}<Link href="/jobs" className="underline">{tr("Browse all jobs")}</Link>
      </p>
    );

  return (
    <div className="space-y-8">
      {lockedJobs > 0 && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          {tr("Showing your top {shown} matches. {count, plural, one {# more ranked match unlocks with a pass.} other {# more ranked matches unlock with a pass.}}", { shown: recs.length, count: lockedJobs })}{" "}
          <Link href="/plans" className="font-medium underline">{tr("See passes")}</Link>
        </p>
      )}
      {(Object.keys(TIERS) as Tier[]).map((tier) => {
        const list = recs.filter((r) => r.tier === tier);
        if (!list.length) return null;
        return (
          <section key={tier}>
            <h2 className="text-sm font-semibold">{tr(TIERS[tier].label)}</h2>
            <p className="mb-3 text-xs text-muted">{tr(TIERS[tier].hint)}</p>
            <ul className="space-y-2">
              {list.map((r, i) => (
                <motion.li key={r.job.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.05 }}>
                  <JobCard job={r.job}>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted">
                      {r.reasons.map((x) => <li key={x}>· {localizeReason(x, tr)}</li>)}
                      {!!r.matched.length && <li>{tr("· You have: {value0}", { value0: displayValue(r.matched.join(", ")) })}</li>}
                      {!!r.missing.length && <li>{tr("· Not on your résumé: {value0}", { value0: displayValue(r.missing.join(", ")) })}</li>}
                    </ul>
                  </JobCard>
                </motion.li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
