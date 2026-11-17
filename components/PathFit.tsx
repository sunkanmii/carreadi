"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PathFits } from "@/lib/analysis/paths";
import { careerById } from "@/lib/careers";
import { track } from "@/lib/client/analytics";
import { normalizeText } from "@/lib/client/extract";
import { api, postJson } from "@/lib/client/http";
import { getPass } from "@/lib/client/pass";
import { messageKey } from "@/lib/i18n";
import { displayValue, useText } from "@/lib/useText";
import { Spinner } from "./Analyzer";

const KEY = "carreadi:paths";

/** Suggestions are kept in this browser for the CV they were made from, never on our servers. */
function loadSaved(resumeKey: string): PathFits | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { resumeKey: string; fits: PathFits } | null;
    return s?.resumeKey === resumeKey ? s.fits : null;
  } catch {
    return null;
  }
}

function keep(resumeKey: string, fits: PathFits) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ resumeKey, fits }));
  } catch {}
}

/**
 * "Which tech path fits me?": from the CV alone, the tech paths it already points to, with the CV
 * lines behind each, what's missing, a first step and a way to see live jobs for that path.
 */
export default function PathFit({ resume, onSeeJobs }: { resume: string; onSeeJobs: (pathId: string) => void }) {
  const tr = useText();
  const resumeKey = messageKey(normalizeText(resume));
  const [fits, setFits] = useState<PathFits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFits(loadSaved(resumeKey));
    setError("");
  }, [resumeKey]);

  // A link that asks for this (e.g. from a post listing tech paths) opens straight on it.
  useEffect(() => {
    if (window.location.hash === "#tech-paths") document.getElementById("tech-paths")?.scrollIntoView({ block: "start" });
  }, []);

  async function suggest() {
    setBusy(true);
    setError("");
    track("paths_started");
    try {
      const { fits } = await api<{ fits: PathFits }>("/api/paths", postJson({ consent: true, resumeText: normalizeText(resume), passToken: getPass()?.token }));
      setFits(fits);
      keep(resumeKey, fits);
      track("paths_succeeded", { paths: fits.paths.map((p) => p.id).join(","), preview: !!fits.preview });
    } catch (e) {
      track("paths_failed", { reason: e instanceof Error ? e.message.slice(0, 80) : "unknown" });
      setError(e instanceof Error ? e.message : tr("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="tech-paths" aria-labelledby="tech-paths-title" className="card scroll-mt-20 space-y-3 p-4">
      <div>
        <h2 id="tech-paths-title" className="font-semibold">{tr("Which tech path fits me?")}</h2>
        <p className="mt-0.5 text-sm text-muted">{tr("From your CV alone: the tech paths you’re already closest to, why, and what to do first.")}</p>
      </div>

      {!fits && (
        <>
          <button className="btn w-full" disabled={busy} onClick={suggest}>
            {busy && <Spinner />}
            {busy ? tr("Reading your CV…") : tr("Suggest tech paths for me")}
          </button>
          <p className="text-xs text-muted">
            {tr("This sends your CV text to our AI. It isn’t stored on our servers.")}{" "}
            <Link href="/privacy" className="underline">{tr("Details")}</Link>
          </p>
        </>
      )}

      {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{tr(error)}</p>}

      {fits && (
        <ol className="space-y-2.5">
          {fits.paths.map((p, i) => {
            const label = tr(careerById(p.id)?.label ?? p.id);
            const locked = !!fits.preview && i > 0;
            return (
              <li key={p.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{label}</h3>
                  {i === 0 && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">{tr("Best fit")}</span>}
                </div>
                <p className="mt-1 text-pretty">{p.why}</p>

                <p className="label mt-3">{tr("From your CV")}</p>
                <ul className="space-y-1">
                  {p.evidence.map((q) => (
                    // ph-mask: CV lines can hold names and employers.
                    <li key={q} dir="auto" className="ph-mask border-s-2 border-accent ps-2 text-xs text-muted">“{q}”</li>
                  ))}
                </ul>

                {locked ? (
                  <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs text-muted">
                    {tr("What’s missing and your first step for this path come with a")}{" "}
                    <Link href="/plans" className="font-medium text-accent underline">{tr("pass")}</Link>.
                  </p>
                ) : (
                  <>
                    {p.missing.length > 0 && (
                      <>
                        <p className="label mt-3">{tr("What’s missing")}</p>
                        <p className="flex flex-wrap gap-1">
                          {p.missing.map((m) => <span key={m} className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn">{m}</span>)}
                        </p>
                      </>
                    )}
                    {p.firstStep && (
                      <>
                        <p className="label mt-3">{tr("Your first step")}</p>
                        <p className="text-pretty">{p.firstStep}</p>
                      </>
                    )}
                  </>
                )}

                <button
                  className="btn-ghost mt-3 w-full text-sm"
                  onClick={() => {
                    track("paths_see_jobs", { path: p.id, rank: i + 1 });
                    onSeeJobs(p.id);
                  }}
                >
                  {tr("See live {value0} jobs →", { value0: displayValue(label) })}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {fits && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{tr("Suggestions only use what your CV shows. Add projects and skills to your CV to see more paths.")}</span>
          <button className="underline hover:text-ink" disabled={busy} onClick={suggest}>{busy ? tr("Reading your CV…") : tr("Suggest again")}</button>
        </p>
      )}
    </section>
  );
}
