"use client";
import { clientLocale } from "@/lib/client/locale";

import { useText } from "@/lib/useText";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/http";
import { safeHref } from "@/lib/url";
import { PROVIDER_NAMES, type Job, type JobSummary, type Provider } from "@/lib/types";

// Feeds whose terms require visible credit with a followed link back to their posting.
const AGGREGATORS = new Set<Provider>(["himalayas", "jobicy", "remoteok", "arbeitnow"]);

const REMOTE_LABEL = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "" } as const;

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(clientLocale(), { month: "short", day: "numeric", year: "numeric" });
}

export default function JobCard({ job, children }: { job: JobSummary; children?: React.ReactNode }) {
  const tr = useText();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function toggle() {
    setOpen(!open);
    if (desc !== null || open) return;
    try {
      const d = await api<{ job: Job }>(`/api/jobs/${encodeURIComponent(job.id)}`);
      setDesc(d.job.description || tr("No description provided."));
    } catch {
      setErr(true);
    }
  }

  const remote =
    job.remote === "remote" ? (job.remoteWorldwide ? tr("Remote · worldwide") : tr("Remote · restricted")) : REMOTE_LABEL[job.remote];
  const date = fmtDate(job.publishedAt);

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{job.title}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {job.company} · {job.location}
            {AGGREGATORS.has(job.provider) && (
              <>
                {" "}{tr("· via")}{" "}
                <a href={safeHref(job.sourceUrl)} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                  {PROVIDER_NAMES[job.provider]}
                </a>
              </>
            )}
          </p>
        </div>
        <a href={safeHref(job.applyUrl)} target="_blank" rel="noopener noreferrer" className="btn-ghost shrink-0 px-3 py-1.5 text-xs">{tr("Apply ↗")}</a>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
        {remote && <span className="rounded-full bg-paper px-2 py-0.5">{tr(remote)}</span>}
        {job.employmentType && <span className="rounded-full bg-paper px-2 py-0.5">{job.employmentType}</span>}
        {job.salary && <span className="rounded-full bg-paper px-2 py-0.5">{job.salary}</span>}
        {date && <span className="rounded-full bg-paper px-2 py-0.5">{job.provider === "lever" ? tr("Created") : tr("Posted")} {date}</span>}
      </div>
      {children}
      <div className="mt-3 flex gap-4 text-xs">
        <button className="text-muted underline underline-offset-2 hover:text-ink" onClick={toggle} aria-expanded={open}>
          {open ? tr("Hide details") : tr("Details")}
        </button>
        <Link href={`/?job=${encodeURIComponent(job.id)}`} className="text-muted underline underline-offset-2 hover:text-ink">{tr("Check my readiness")}</Link>
      </div>
      {open && (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-xl bg-paper p-3 text-xs leading-relaxed whitespace-pre-line">
          {err ? tr("Couldn't load this posting.") : desc ?? tr("Loading…")}
          <p className="mt-3 text-muted">
            {tr("Source: ")}{PROVIDER_NAMES[job.provider]} {tr(" · checked ")}{fmtDate(job.lastChecked)} ·{" "}
            <a href={safeHref(job.sourceUrl)} target="_blank" rel="noopener noreferrer" className="underline">{tr("original posting ↗")}</a>
          </p>
        </div>
      )}
    </article>
  );
}
