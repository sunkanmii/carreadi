"use client";
import { useText } from "@/lib/useText";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import type { Guide, Proof } from "@/lib/analysis/coach";
import { track } from "@/lib/client/analytics";
import { downloadCv } from "@/lib/client/export";
import { api, postJson } from "@/lib/client/http";
import { getPass } from "@/lib/client/pass";
import { getSession } from "@/lib/client/session";
import { load } from "@/lib/client/store";
import type { Roadmap, Task, TaskProof } from "@/lib/roadmap";
import { safeHref } from "@/lib/url";
import { Spinner } from "./Analyzer";

const stepOf = (t: Task, roleTitle: string) => ({ roleTitle: roleTitle || "the role", requirement: t.requirement, title: t.title, deliverable: t.deliverable });

/** One plain sentence on why the step is on the roadmap: what the job asks for and what the CV showed. */
export function StepWhy({ task }: { task: Task }) {
  const tr = useText();
  if (!task.status || !task.importance || task.requirement === "Custom") return null;
  const asks = task.importance === "required" ? tr("The job lists this as required") : task.importance === "preferred" ? tr("The job says this is preferred") : tr("The job mentions this as a plus");
  const cv = task.status === "missing" ? tr("and your CV doesn't mention it.") : task.status === "not_shown" ? tr("and your CV shows related work, but not this exactly.") : tr("and your CV doesn't make it clear.");
  return (
    <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-xs text-muted">
      <span className="font-medium text-ink">{tr("Why this step: ")}</span>
      {asks} {cv}
    </p>
  );
}

/** Opens the guide to doing the step well, writing it the first time. */
export function StepGuide({ task, roleTitle, onSave }: { task: Task; roleTitle: string; onSave: (guide: Guide) => void }) {
  const tr = useText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (task.requirement === "Custom") return null;

  async function toggle() {
    setOpen((o) => !o);
    if (task.guide || busy || open) return;
    setBusy(true);
    setError("");
    try {
      const { guide } = await api<{ guide: Guide }>("/api/guide", postJson(stepOf(task, roleTitle)));
      onSave(guide);
      track("guide_opened");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Couldn't write the guide right now. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const g = task.guide;
  return (
    <div className="mt-3">
      <button type="button" className="text-xs font-medium text-accent underline underline-offset-2" aria-expanded={open} onClick={toggle}>
        {open ? tr("Hide the guide ▴") : tr("📘 How to do this well ▾")}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-4 rounded-xl border border-line bg-paper/60 p-4 text-sm">
              {busy && <p role="status" className="flex items-center gap-2 text-xs text-muted"><Spinner />{tr("Writing your guide… about 20 seconds.")}</p>}
              {error && <p role="alert" className="text-xs text-bad">{error}</p>}
              {g && (
                <>
                  <section>
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{tr("Why employers care")}</h4>
                    <p className="mt-1">{g.why}</p>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{tr("How to do it")}</h4>
                    <ol className="mt-1.5 list-decimal space-y-1.5 ps-5">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{tr("Where to learn")}</h4>
                    <ul className="mt-1.5 space-y-1.5">
                      {g.resources.map((r, i) => (
                        <li key={i}>
                          <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2" onClick={() => track("resource_opened", { from: "guide" })}>{r.name} ↗</a>
                          {r.use && <span className="text-muted"> · {r.use}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{tr("Avoid")}</h4>
                    <ul className="mt-1.5 space-y-1.5">{g.avoid.map((a, i) => <li key={i} className="flex gap-2"><span className="text-bad">✕</span><span>{a}</span></li>)}</ul>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{tr("How to show it")}</h4>
                    <p className="mt-1">{g.showIt}</p>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const VERDICT = {
  meets: { label: "✓ This meets the requirement", cls: "bg-accent-soft text-accent" },
  partly: { label: "Almost there", cls: "bg-warn-soft text-warn" },
  not_yet: { label: "Not shown yet", cls: "bg-bad-soft text-bad" },
} as const;

/** "I've done it": share links to the work, get it checked, and get CV text from it. */
export function StepProof({ task, roleTitle, onSave }: { task: Task; roleTitle: string; onSave: (proof: TaskProof, done: boolean) => void }) {
  const tr = useText();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<string[]>(task.proof?.links ?? [""]);
  const [notes, setNotes] = useState(task.proof?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsPass, setNeedsPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const paid = !!(getPass()?.token || getSession());
  const p = task.proof;

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const list = links.map((l) => l.trim()).filter(Boolean);
    if (!list.length) return setError(tr("Add at least one link to your work."));
    setBusy(true);
    setError("");
    setNeedsPass(false);
    try {
      const { proof } = await api<{ proof: Proof }>("/api/proof", postJson({ ...stepOf(task, roleTitle), links: list, notes: notes.trim(), passToken: getPass()?.token }));
      const saved: TaskProof = { ...proof, links: list, notes: notes.trim(), checkedAt: new Date().toISOString() };
      onSave(saved, proof.verdict === "meets" ? true : task.done);
      setOpen(false);
      track("work_checked", { verdict: proof.verdict });
    } catch (err) {
      const message = err instanceof Error ? err.message : tr("Couldn't check your work right now. Please try again.");
      setNeedsPass(/pass/i.test(message));
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!p) return;
    await navigator.clipboard.writeText(cvText(p));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      {p && (
        <div className="mb-3 space-y-2 text-sm">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${VERDICT[p.verdict].cls}`}>{tr(VERDICT[p.verdict].label)}</span>
          {!!p.strengths.length && <ul className="space-y-1 text-xs">{p.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-accent">✓</span><span>{s}</span></li>)}</ul>}
          {!!p.improve.length && (
            <div className="text-xs">
              <p className="font-medium">{tr("To make it stronger:")}</p>
              <ul className="mt-1 space-y-1">{p.improve.map((s, i) => <li key={i} className="flex gap-2"><span className="text-warn">→</span><span>{s}</span></li>)}</ul>
            </div>
          )}
          {!!p.project.bullets.length && (
            <div className="rounded-xl border border-accent/25 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">{tr("For your CV")}</p>
                <button type="button" className="text-xs font-medium text-accent underline" onClick={copy}>{copied ? tr("Copied ✓") : tr("Copy")}</button>
              </div>
              <p className="mt-1.5 font-medium">{p.project.name}{p.links[0] && <span className="font-normal text-muted"> · {p.links[0]}</span>}</p>
              <p className="text-xs text-muted">{p.project.line}</p>
              <ul className="mt-1.5 list-disc space-y-1 ps-5 text-xs">{p.project.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!open ? (
        <button type="button" className="text-xs font-medium underline underline-offset-2 hover:text-ink" onClick={() => setOpen(true)}>
          {p ? tr("🔁 Re-check my work") : paid ? tr("🔗 I've done it: check my work") : tr("🔒 I've done it: check my work")}
        </button>
      ) : (
        <form onSubmit={check} className="space-y-2">
          <p className="text-xs text-muted">{tr("Share links where an employer could see the work: a GitHub repo, a live site, a case study or a demo video.")}</p>
          {links.map((l, i) => (
            <input key={i} type="url" inputMode="url" dir="ltr" required={i === 0} className="field py-2 text-sm" placeholder={i === 0 ? "https://github.com/you/project" : "https://…"} aria-label={tr("Link {n}", { n: i + 1 })}
              value={l} onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          {links.length < 3 && <button type="button" className="text-xs text-muted underline" onClick={() => setLinks([...links, ""])}>{tr("+ Add another link")}</button>}
          <textarea dir="auto" rows={3} maxLength={1500} className="field text-sm" placeholder={tr("What did you build, and what did you do yourself? (optional, but it helps)")} aria-label={tr("Notes about your work")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">
              {error} {needsPass && <Link href="/plans" className="font-medium underline">{tr("See passes")}</Link>}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button className="btn py-1.5 text-xs" disabled={busy}>{busy && <Spinner />}{busy ? tr("Checking your work…") : tr("Check my work")}</button>
            <button type="button" className="text-xs text-muted underline" onClick={() => setOpen(false)}>{tr("Cancel")}</button>
          </div>
        </form>
      )}
    </div>
  );
}

const cvText = (p: TaskProof) => [`${p.project.name}${p.links[0] ? ` | ${p.links[0]}` : ""}`, p.project.line, ...p.project.bullets.map((b) => `• ${b}`)].filter(Boolean).join("\n");

/** Once work is checked: the CV with those projects added, ready to download and send. */
export function CvUpdate({ roadmap }: { roadmap: Roadmap }) {
  const tr = useText();
  const [done, setDone] = useState("");
  const projects = roadmap.tasks.map((t) => t.proof).filter((p): p is TaskProof => !!p && p.verdict !== "not_yet" && p.project.bullets.length > 0);
  if (!projects.length) return null;
  const resume = load().resumeText ?? "";

  async function copyAll() {
    await navigator.clipboard.writeText(projects.map(cvText).join("\n\n"));
    setDone(tr("Copied ✓"));
    setTimeout(() => setDone(""), 2500);
  }

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mt-6 p-5">
      <h3 className="font-semibold tracking-tight">{tr("📄 Your CV, with your new projects")}</h3>
      <p className="mt-1 text-sm text-muted">
        {tr("{count} checked project(s) ready to add. We put them in a Projects section of your CV. Read it over before you send it.", { count: projects.length })}
      </p>
      <ul className="mt-3 space-y-1 text-sm">{projects.map((p, i) => <li key={i}>• <span className="font-medium">{p.project.name}</span></li>)}</ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {resume && (
          <button className="btn" onClick={() => { downloadCv(resume, projects.map((p) => ({ ...p.project, link: p.links[0] ?? "" }))); track("cv_downloaded", { projects: projects.length }); }}>
            {tr("Download updated CV (.docx)")}
          </button>
        )}
        <button className="btn-ghost" onClick={copyAll}>{tr("Copy project text")}</button>
        {done && <span role="status" className="text-xs text-accent">{done}</span>}
      </div>
      {!resume && <p className="mt-2 text-xs text-muted">{tr("Your CV isn't on this device, so copy the text and paste it into your CV.")}</p>}
    </motion.section>
  );
}
