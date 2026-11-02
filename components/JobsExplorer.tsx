"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CAREER_PATHS } from "@/lib/careers";
import { api } from "@/lib/client/http";
import type { JobSummary } from "@/lib/types";
import { track } from "@/lib/client/analytics";
import JobCard from "./JobCard";
import { Spinner } from "./Analyzer";
import SourcePicker, { useSources } from "./SourcePicker";

// Sources we don't pull from directly (no permitted public API we've verified): link out instead.
const EXTERNAL = [
  { name: "LinkedIn", url: (q: string) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}` },
  { name: "Indeed", url: (q: string) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}` },
  { name: "Wellfound", url: (q: string) => `https://wellfound.com/jobs?query=${encodeURIComponent(q)}` },
  { name: "YC jobs", url: () => "https://www.ycombinator.com/jobs" },
];

export default function JobsExplorer() {
  const [f, setF] = useState({ q: "", path: "", location: "", remote: "any", type: "" });
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{ jobs: JobSummary[]; total: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sources, setSources] = useSources();

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ ...f, page: String(page), sources: sources.join(",") });
        if (page === 0) track("jobs_searched", { has_query: !!f.q, path: f.path || null, remote: f.remote, sources: sources.length });
        const d = await api<{ jobs: JobSummary[]; total: number; errors: string[] }>(`/api/jobs?${qs}`);
        setState((prev) => ({ ...d, jobs: page && prev ? [...prev.jobs, ...d.jobs] : d.jobs }));
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "Couldn't load jobs.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [f, page, sources]);

  const update = (k: keyof typeof f, v: string) => {
    setPage(0);
    setF({ ...f, [k]: v });
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Live jobs</h1>
      <p className="mt-1 text-sm text-muted">From employer career pages, plus remote-job sites if you turn them on.</p>

      <div className="mt-6 space-y-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" className="field" placeholder="Search title or company" value={f.q} onChange={(e) => update("q", e.target.value)} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select aria-label="Career path" className="field" value={f.path} onChange={(e) => update("path", e.target.value)}>
            <option value="">All paths</option>
            {CAREER_PATHS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input aria-label="Location" className="field" placeholder="Location" value={f.location} onChange={(e) => update("location", e.target.value)} />
          <select aria-label="Work style" className="field" value={f.remote} onChange={(e) => update("remote", e.target.value)}>
            <option value="any">Any work style</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
          <select aria-label="Employment type" className="field" value={f.type} onChange={(e) => update("type", e.target.value)}>
            <option value="">Any type</option>
            <option value="full">Full-time</option>
            <option value="part">Part-time</option>
            <option value="contract">Contract</option>
            <option value="intern">Internship</option>
          </select>
        </div>
        <SourcePicker value={sources} onChange={(v) => { setPage(0); setSources(v); }} />
      </div>

      <div className="mt-6">
        {state && (
          <p className="mb-3 text-xs text-muted">
            {state.total.toLocaleString()} jobs{state.errors.length ? ` · ${state.errors.join(", ")}` : ""}
          </p>
        )}
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
        {loading && !state && <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading live jobs…</p>}
        {state && !state.jobs.length && !loading && (
          <div className="py-12 text-center">
            <p className="font-medium">No jobs match</p>
            <p className="mt-1 text-sm text-muted">Try fewer filters, or search the sites below.</p>
          </div>
        )}
        <ul className="space-y-2">
          {state?.jobs.map((j) => <li key={j.id}><JobCard job={j} /></li>)}
        </ul>
        {state && state.jobs.length < state.total && (
          <button className="btn-ghost mx-auto mt-4 flex" disabled={loading} onClick={() => setPage(page + 1)}>
            {loading ? "Loading…" : "Show more"}
          </button>
        )}
      </div>

      <div className="mt-10 border-t border-line pt-5 text-xs text-muted">
        <p className="mb-2">
          Can&rsquo;t find a company?{" "}
          <Link href="/request" className="font-medium text-ink underline underline-offset-2">Request it</Link>
        </p>
        Search other sites:{" "}
        {EXTERNAL.map((s, i) => (
          <span key={s.name}>
            {i > 0 && " · "}
            <a className="underline hover:text-ink" href={s.url(f.q)} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>
          </span>
        ))}
      </div>
    </div>
  );
}
