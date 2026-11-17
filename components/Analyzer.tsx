"use client";
import { clientLocale } from "@/lib/client/locale";

import { useText, displayValue } from "@/lib/useText";
import { rovingKeys } from "@/lib/client/keyboard";
import { localizeReason } from "@/lib/localizeReason";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CAREER_PATHS, careerById, guessCareerPath, skillsIn } from "@/lib/careers";
import { extractResume, MAX_RESUME_CHARS, normalizeText } from "@/lib/client/extract";
import type { Analysis } from "@/lib/analysis/schema";
import { api, postJson } from "@/lib/client/http";
import { load, save, type Prefs, type Saved } from "@/lib/client/store";
import type { Recommendation, Tier } from "@/lib/recommend";
import { buildRoadmap } from "@/lib/roadmap";
import type { Job, JobSummary, Provider } from "@/lib/types";
import { track } from "@/lib/client/analytics";
import { getPass } from "@/lib/client/pass";
import AnalyzeProgress from "./AnalyzeProgress";
import PathFit from "./PathFit";
import SourcePicker, { useSources } from "./SourcePicker";

type JobMode = "match" | "pick" | "paste";

export default function Analyzer() {
  const tr = useText();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const jobsRef = useRef<HTMLDivElement>(null);
  const [resume, setResume] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasting, setPasting] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [mode, setMode] = useState<JobMode>("match");
  const [jobText, setJobText] = useState("");
  const [picked, setPicked] = useState<JobSummary | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ careerPath: "", location: "", remote: "any" });
  const [sources, setSources] = useSources();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Restore the last résumé (kept only in this browser) and a job passed via ?job=.
  useEffect(() => {
    const s = load();
    if (s.resumeText) {
      setResume(s.resumeText);
      setFileName(tr("Saved résumé"));
    }
    if (s.prefs) setPrefs(s.prefs);
    else if (s.resumeText) setPrefs((p) => ({ ...p, careerPath: guessCareerPath(s.resumeText!) }));
    const params = new URLSearchParams(window.location.search);
    // Re-checking a pasted job from the history: bring the job text back.
    if (params.has("recheck") && s.jobText && !s.jobId) {
      setMode("paste");
      setJobText(s.jobText);
    }
    const id = params.get("job");
    if (id) {
      setMode("pick");
      api<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}`)
        .then(({ job }) => setPicked({ ...job, snippet: "" }))
        .catch(() => setError(tr("That job is no longer listed.")));
    }
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      const text = await extractResume(file);
      setNotice(text.length >= MAX_RESUME_CHARS ? tr("Your résumé is very long, so we kept the first 30,000 characters (about 4,500 words). Trim it for the best result.") : "");
      setResume(text);
      track("resume_loaded", { method: "upload", file_type: file.name.split(".").pop()?.toLowerCase(), words: Math.round(text.split(/s+/).length / 100) * 100 });
      setFileName(file.name);
      setPasting(false);
      // A new résumé gets a fresh guess; the user can change it in the dropdown.
      setPrefs((p) => ({ ...p, careerPath: guessCareerPath(text, file.name) || p.careerPath }));
      setPicked(null);
      setMode("match");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Couldn't read that file."));
    } finally {
      setReading(false);
    }
  }

  const resumeReady = resume.trim().length >= 200;
  const jobReady = mode === "paste" ? jobText.trim().length >= 100 : !!picked;
  const canSubmit = resumeReady && jobReady && consent && !busy;

  async function submit(retried = false) {
    setBusy(true);
    setReconnecting(retried);
    setError("");
    try {
      const usePicked = mode !== "paste" && picked;
      const body = {
        consent,
        resumeText: normalizeText(resume),
        jobId: usePicked ? picked.id : undefined,
        jobText: usePicked ? undefined : jobText.trim(),
        careerPath: prefs.careerPath || undefined,
        location: prefs.location || undefined,
        remote: prefs.remote,
        passToken: getPass()?.token,
      };
      const t0 = Date.now();
      track("analysis_started", { job_source: usePicked ? mode : "paste", career_path: body.careerPath ?? null });
      const data = await api<{ analysis: Analysis; job: Saved["job"] }>("/api/analyze", postJson(body));
      track("analysis_succeeded", {
        seconds: Math.round((Date.now() - t0) / 1000),
        findings: data.analysis.findings.length,
        shown: data.analysis.findings.filter((f) => f.status === "demonstrated").length,
      });
      const prev = load();
      // Refreshing against the same target keeps progress; a new target starts a new roadmap.
      const sameTarget = prev.analysis && (prev.jobId ? prev.jobId === body.jobId : prev.jobText === body.jobText);
      save({
        resumeText: body.resumeText,
        jobText: body.jobText,
        jobId: body.jobId,
        job: data.job,
        prefs,
        analysis: data.analysis,
        roadmap: buildRoadmap(data.analysis, sameTarget ? prev.roadmap : null),
      });
      router.push("/results");
    } catch (e) {
      // The connection dropped (often a phone killing the request while the user is in another app).
      // Run it again once they're back: the same résumé and job don't use up another free check.
      if (e instanceof TypeError && !retried) {
        const again = () => void submit(true);
        if (document.visibilityState === "visible") again();
        else document.addEventListener("visibilitychange", function back() {
          if (document.visibilityState !== "visible") return;
          document.removeEventListener("visibilitychange", back);
          again();
        });
        return;
      }
      track("analysis_failed", { reason: e instanceof Error ? e.message.slice(0, 80) : "unknown" });
      setError(e instanceof Error ? e.message : tr("Analysis failed."));
      setBusy(false);
      setReconnecting(false);
    }
  }

  return (
    <div className="mt-10 w-full max-w-xl space-y-3">
      {/* Step 1 — résumé */}
      {!resumeReady || pasting ? (
        pasting ? (
          <div className="card p-3">
            <label htmlFor="resume-text" className="sr-only">{tr("Résumé text")}</label>
            <textarea dir="auto"
              id="resume-text"
              autoFocus
              rows={8}
              className="field resize-y border-0 p-2"
              placeholder={tr("Paste your résumé text")}
              maxLength={MAX_RESUME_CHARS}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
            <div className="flex items-center justify-between px-2 pt-1 text-xs text-muted">
              <span>
                {resume.trim().length < 200
                  ? tr("{value0} more characters needed", { value0: displayValue(Math.max(0, 200 - resume.trim().length)) })
                  : tr("{value0} / {value1} characters", { value0: displayValue(resume.length.toLocaleString(clientLocale())), value1: displayValue(MAX_RESUME_CHARS.toLocaleString(clientLocale())) })}
              </span>
              <button className="underline hover:text-ink" onClick={() => {
                  setPasting(false);
                  setFileName(resumeReady ? tr("Pasted text") : "");
                  if (resumeReady) track("resume_loaded", { method: "paste", words: Math.round(resume.split(/s+/).length / 100) * 100 });
                  if (resumeReady) setPrefs((p) => ({ ...p, careerPath: guessCareerPath(resume) || p.careerPath }));
                }}>
                {resumeReady ? tr("Done") : tr("Upload instead")}
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
            className={`card flex flex-col items-center px-6 py-12 text-center transition ${dragging ? "border-accent bg-accent-soft" : "border-dashed"}`}
          >
            <input dir="auto" ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={reading}>
              {reading ? <Spinner /> : <UploadIcon />}
              {reading ? tr("Reading…") : tr("Upload résumé")}
            </button>
            <p className="mt-3 text-xs text-muted">
              {tr("PDF, DOCX or TXT · up to 5 MB, about 4,500 words · read in your browser ·")}{" "}
              <button className="underline hover:text-ink" onClick={() => setPasting(true)}>{tr("paste text")}</button>
            </p>
            <p id="tech-paths" className="mt-4 scroll-mt-20 text-sm text-muted text-pretty">{tr("Not sure which tech path fits you? Upload your CV and we’ll suggest the ones it already points to.")}</p>
          </div>
        )
      ) : (
        <div className="card flex items-center justify-between px-4 py-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Check />
            {/* ph-mask: file names usually contain the person's name. */}
            <span className="ph-mask truncate">{fileName || "Résumé"}</span>
            <span className="shrink-0 text-muted">{tr("· {value0} words", { value0: displayValue(resume.split(/\s+/).length.toLocaleString(clientLocale())) })}</span>
          </span>
          <button className="text-xs text-muted underline hover:text-ink" onClick={() => { setResume(""); setFileName(""); }}>{tr("Replace")}</button>
        </div>
      )}

      {/* Not sure what to aim for? Tech paths that fit the CV, each leading to its live jobs below. */}
      {resumeReady && !pasting && (
        <PathFit
          resume={resume}
          onSeeJobs={(id) => {
            setPrefs((p) => ({ ...p, careerPath: id }));
            setMode("match");
            setPicked(null);
            jobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      {/* Step 2 — target job */}
      {resumeReady && !pasting && (
        <div ref={jobsRef} className="card scroll-mt-20 space-y-4 p-4">
          <div className="flex gap-1 rounded-full bg-paper p-1 text-sm" role="tablist" aria-label={tr("Choose a target job")} onKeyDown={rovingKeys}>
            {(["match", "pick", "paste"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                id={`job-tab-${m}`}
                aria-controls="job-panel"
                tabIndex={mode === m ? 0 : -1}
                aria-selected={mode === m}
                onClick={() => { setMode(m); if (m !== "paste") setPicked(null); }}
                className={`flex-1 rounded-full py-1.5 ${mode === m ? "bg-white font-medium shadow-sm" : "text-muted"}`}
              >
                {m === "match" ? tr("Matched for you") : m === "pick" ? tr("Search jobs") : tr("Paste a job")}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="job-panel" aria-labelledby={`job-tab-${mode}`} tabIndex={0} className="space-y-5">
          {/* A pasted job is already chosen: only the career path still matters, for the roadmap. */}
          <div className={`grid grid-cols-1 gap-3 ${mode === "paste" ? "" : "sm:grid-cols-3"}`}>
            <div>
              <label className="label" htmlFor="path">{tr("Career path")}</label>
              <select id="path" className="field" value={prefs.careerPath} onChange={(e) => setPrefs({ ...prefs, careerPath: e.target.value })}>
                <option value="">{tr("Any")}</option>
                {CAREER_PATHS.map((c) => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}
              </select>
            </div>
            {mode !== "paste" && <>
            <div>
              <label className="label" htmlFor="loc">{tr("Location")}</label>
              <input dir="auto" id="loc" className="field" placeholder={tr("e.g. United States")} value={prefs.location} onChange={(e) => setPrefs({ ...prefs, location: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="remote">{tr("Work style")}</label>
              <select id="remote" className="field" value={prefs.remote} onChange={(e) => setPrefs({ ...prefs, remote: e.target.value as Prefs["remote"] })}>
                <option value="any">{tr("Any")}</option>
                <option value="remote">{tr("Remote")}</option>
                <option value="hybrid">{tr("Hybrid")}</option>
                <option value="onsite">{tr("On-site")}</option>
              </select>
            </div>
            </>}
          </div>

          {/* Filters come first: they shape the matched list below. */}
          {mode !== "paste" && <SourcePicker value={sources} onChange={setSources} />}

          {mode === "match" ? (
            <MatchList resume={resume} prefs={prefs} sources={sources} picked={picked} onPick={setPicked} />
          ) : mode === "paste" ? (
            <JobPaste value={jobText} onChange={setJobText} />
          ) : (
            <JobPicker sources={sources} picked={picked} onPick={setPicked} />
          )}


          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
            <input dir="auto" type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              {tr("Send my CV text to our AI for this analysis. It isn’t stored on our servers.")}{" "}
              <Link href="/privacy" className="underline">{tr("Details")}</Link>
            </span>
          </label>

          <button className="btn w-full" disabled={!canSubmit} onClick={() => submit()}>
            {busy && <Spinner />}
            {busy ? tr("Analyzing your CV…") : tr("Check my career readiness")}
          </button>
          {busy && <AnalyzeProgress key={reconnecting ? "re" : "first"} reconnecting={reconnecting} />}
          </div>
        </div>
      )}

      {notice && !error && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{tr(notice)}</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
          {tr(error)}
          {/pass/i.test(error) && (
            <>
              {" "}
              <Link href="/plans" className="font-medium underline">{tr("See passes")}</Link>
            </>
          )}
        </p>
      )}

      {!resumeReady && (
        <p className="pt-3 text-center text-sm">
          <Link href="/jobs" className="text-muted underline-offset-4 hover:text-ink hover:underline">{tr("Explore jobs →")}</Link>
        </p>
      )}
    </div>
  );
}

/**
 * Short "can I take this job?" notes from the ranking reasons: location and remote limits and
 * hard requirements (language, visa, clearance). Shown up front so the user doesn't have to guess.
 */
function fitNotes(r: Recommendation, location: string): { text: string; ok: boolean }[] {
  const notes: { text: string; ok: boolean }[] = [];
  if (r.job.remote === "remote") notes.push(r.job.remoteWorldwide ? { text: "Remote worldwide", ok: true } : { text: "Remote, only in listed places", ok: false });
  for (const reason of r.reasons) {
    if (reason.startsWith("Location fits")) notes.push({ text: `Open to ${location}`, ok: true });
    else if (reason.startsWith("Location may not fit")) notes.push({ text: `Not listed for ${location}`, ok: false });
    else if (reason.startsWith("Requires")) notes.push({ text: reason.replace(/ — check you qualify$/, ""), ok: false });
  }
  return notes;
}

const TIER_LABEL: Record<Tier, string> = { apply: "Apply now", review: "Worth reviewing", future: "Future target" };
const TIER_ORDER: Record<Tier, number> = { apply: 0, review: 1, future: 2 };

/**
 * Ranks live jobs against the skills found in the résumé (same rules as /api/recommend, no AI)
 * and preselects the best one, so the user doesn't have to hunt for a job first.
 */
function MatchList({ resume, prefs, sources, picked, onPick }: { resume: string; prefs: Prefs; sources: Provider[]; picked: JobSummary | null; onPick: (j: JobSummary | null) => void }) {
  const tr = useText();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [note, setNote] = useState("");
  const [lockedCount, setLockedCount] = useState(0);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setRecs(null);
      const base = { skills: skillsIn(resume), location: prefs.location || undefined, remote: prefs.remote, sources, passToken: getPass()?.token };
      const get = (careerPath?: string) => api<{ recommendations: Recommendation[]; locked: number }>("/api/recommend", postJson({ ...base, careerPath }));
      try {
        let res = await get(prefs.careerPath || undefined);
        let msg = "";
        if (!res.recommendations.length && prefs.careerPath) {
          res = await get();
          msg = tr("No live {value0} roles right now. These are the closest by skills.", { value0: displayValue(careerById(prefs.careerPath)?.label ?? "") });
        }
        const list = res.recommendations.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]).slice(0, 6);
        if (!live) return;
        setRecs(list);
        setLockedCount(res.locked);
        setNote(msg);
        if (!list.some((r) => r.job.id === pickedRef.current?.id)) onPick(list[0]?.job ?? null);
      } catch {
        if (live) setRecs([]);
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [resume, prefs.careerPath, prefs.location, prefs.remote, sources, onPick]);

  if (!recs) return <p className="flex items-center gap-2 px-1 py-3 text-xs text-muted"><Spinner /> {tr(" Finding live jobs that fit your résumé…")}</p>;
  if (!recs.length) return <p className="px-1 py-3 text-xs text-muted">{tr("No close matches in today’s live jobs. Try another career path, turn on more job sources, paste a job, or")}{" "}
        <Link href="/request" className="underline">{tr("request a company")}</Link>.</p>;

  return (
    <div>
      {note && <p className="mb-2 px-1 text-xs text-muted">{note}</p>}
      {lockedCount > 0 && (
        <p className="mb-2 px-1 text-xs text-muted">
          {tr("Showing your top {shown} matches. Additional matches: {count}. Unlock with a", { shown: recs.length, count: lockedCount })}{" "}
          <Link href="/plans" className="font-medium text-accent underline">{tr("pass")}</Link>.
        </p>
      )}
      {!prefs.location && <p className="mb-2 px-1 text-xs text-muted">{tr("Add your location above to see which jobs you can actually take.")}</p>}
      <ul className="space-y-1" role="radiogroup" aria-label={tr("Matched jobs")} onKeyDown={(event) => rovingKeys(event, "radio")}>
        {recs.map((r) => {
          const on = r.job.id === picked?.id;
          return (
            <li key={r.job.id} role="none">
              <button
                role="radio"
                aria-checked={on}
                tabIndex={on || (!recs.some((item) => item.job.id === picked?.id) && r === recs[0]) ? 0 : -1}
                onClick={() => { onPick(r.job); track("job_selected", { from: "match", tier: r.tier, rank: recs.indexOf(r) + 1 }); }}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition ${on ? "border-accent bg-accent-soft" : "border-transparent hover:bg-paper"}`}
              >
                <span className={`mt-1 size-3.5 shrink-0 rounded-full border-2 ${on ? "border-accent bg-accent" : "border-line"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.job.title}</span>
                  {/* Full location, never truncated: it decides whether you can take the job. */}
                  <span className="block text-xs break-words text-muted">{tr("{value0} · {value1}", { value0: displayValue(r.job.company), value1: displayValue(r.job.location) })}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                    {r.listed > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 ${r.matched.length * 2 >= r.listed ? "bg-accent-soft text-accent" : "bg-paper text-muted"}`}
                        title={[r.matched.length && tr("You have: {value0}", { value0: displayValue(r.matched.join(", ")) }), r.missing.length && tr("Not on your résumé: {value0}", { value0: displayValue(r.missing.join(", ")) })].filter(Boolean).join(" · ")}
                      >
                        {r.listed === 1
                          ? r.matched.length ? tr("You have the 1 skill it lists") : tr("You don't have the 1 skill it lists")
                          : tr("You have {value0} of the {value1} skills it lists", { value0: displayValue(r.matched.length), value1: displayValue(r.listed) })}
                      </span>
                    )}
                    {fitNotes(r, prefs.location).map((n) => (
                      <span key={n.text} className={`rounded-full px-2 py-0.5 ${n.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>
                        {localizeReason(n.text, tr)}
                      </span>
                    ))}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${r.tier === "apply" ? "bg-accent text-white" : "bg-paper text-muted"}`}>{tr(TIER_LABEL[r.tier])}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JobPicker({ sources, picked, onPick }: { sources: Provider[]; picked: JobSummary | null; onPick: (j: JobSummary | null) => void }) {
  const tr = useText();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (picked) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await api<{ jobs: JobSummary[] }>(`/api/jobs?q=${encodeURIComponent(q)}&sources=${sources.join(",")}`);
        setResults(d.jobs);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked, sources]);

  if (picked)
    return (
      <div className="flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5 text-sm">
        <span className="min-w-0 truncate"><b className="font-medium">{picked.title}</b> <span className="text-muted">{tr("· {value0}", { value0: displayValue(picked.company) })}</span></span>
        <button className="ms-3 shrink-0 text-xs text-muted underline" onClick={() => onPick(null)}>{tr("Change")}</button>
      </div>
    );

  return (
    <div>
      <label htmlFor="job-q" className="sr-only">{tr("Search jobs")}</label>
      <input dir="auto" id="job-q" className="field" placeholder={tr("Search title or company")} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {loading && !results.length && <li className="px-2 py-3 text-xs text-muted">{tr("Loading live jobs…")}</li>}
        {!loading && !results.length && <li className="px-2 py-3 text-xs text-muted">{tr("No matching jobs.")}</li>}
        {results.map((j) => (
          <li key={j.id}>
            <button className="w-full rounded-lg px-2.5 py-2 text-start text-sm hover:bg-paper" onClick={() => onPick(j)}>
              <span className="font-medium">{j.title}</span>
              <span className="block text-xs text-muted">{tr("{value0} · {value1}", { value0: displayValue(j.company), value1: displayValue(j.location) })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

function UploadIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

type LinkedJob = { title: string; company: string; location: string; url: string; description: string };
const LINK_RE = /^https?:\/\/\S+\.\S+$/i;

/** A job from its link, or its pasted text: one or the other, each with its own box. */
function JobPaste({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tr = useText();
  // Re-checking a pasted job from the history brings its text back, so start on the text box then.
  const [kind, setKind] = useState<"link" | "text">(() => (value.trim() ? "text" : "link"));
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<LinkedJob | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const link = url.trim();
  const isLink = LINK_RE.test(link);

  useEffect(() => {
    if (kind !== "link") return;
    setJob(null);
    onChange("");
    setError("");
    if (!isLink) { setState("idle"); return; }
    let live = true;
    setState("loading");
    const t = setTimeout(() => {
      // The host can drop a busy request with a 5xx; one quiet retry covers that.
      const get = () => api<{ job: LinkedJob }>("/api/jobs/import", postJson({ url: link }));
      get()
        .catch((e) => new Promise((r) => setTimeout(r, 700)).then(() => (live ? get() : Promise.reject(e))))
        .then(({ job }) => {
          if (!live) return;
          const head = [job.company ? `${job.title} at ${job.company}` : job.title, job.location && `Location: ${job.location}`, `Link: ${job.url}`];
          setJob(job);
          setState("idle");
          onChange(`${head.filter(Boolean).join("\n")}\n\n${job.description}`);
          track("job_link_imported", { host: new URL(job.url).hostname });
        })
        .catch((e) => {
          if (!live) return;
          setState("error");
          setError(e instanceof Error ? e.message : tr("We couldn't read that link. Copy the job description and paste it instead."));
        });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [kind, isLink, link]);

  function choose(next: "link" | "text") {
    if (next === kind) return;
    setKind(next);
    setUrl("");
    setJob(null);
    setState("idle");
    setError("");
    onChange("");
  }

  return (
    <div className="space-y-3 border-t border-line pt-5">
      <p className="label">{tr("The job")}</p>
      <div className="inline-flex rounded-full border border-line p-0.5 text-xs" role="radiogroup" aria-label={tr("How do you want to add the job?")}>
        {(["link", "text"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => choose(k)}
            className={`rounded-full px-3 py-1 ${kind === k ? "bg-ink font-medium text-white" : "text-muted hover:text-ink"}`}>
            {k === "link" ? tr("🔗 Job link") : tr("📝 Job text")}
          </button>
        ))}
      </div>

      {kind === "link" ? (
        <div className="space-y-2">
          <label htmlFor="job-link" className="sr-only">{tr("Job link")}</label>
          <input id="job-link" type="url" inputMode="url" dir="ltr" spellCheck={false} autoCapitalize="none" autoComplete="off" className="field"
            placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          {state === "loading" && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted"><Spinner />{tr("Getting the job details…")}</p>
          )}
          {state === "error" && (
            <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad">
              {error}{" "}
              <button type="button" className="font-medium underline" onClick={() => choose("text")}>{tr("Paste the text instead")}</button>
            </p>
          )}
          {job && state === "idle" && (
            <div role="status" className="rounded-xl border border-accent/25 bg-accent-soft px-3 py-2.5 text-sm">
              <p className="text-xs font-medium text-accent">{tr("✓ Job found")}</p>
              <p className="mt-0.5 font-medium">{job.title}</p>
              <p className="text-xs text-muted">{[job.company, job.location].filter(Boolean).join(" · ")}</p>
            </div>
          )}
          {!link && <p className="text-xs text-muted">{tr("Paste the link to one job. Works with most company careers pages and job sites.")}</p>}
        </div>
      ) : (
        <div>
          <label htmlFor="job-text" className="sr-only">{tr("Job description")}</label>
          <textarea dir="auto" id="job-text" rows={5} className="field resize-y" placeholder={tr("Paste a job description from anywhere")} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      )}
    </div>
  );
}
