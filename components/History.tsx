"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AccountBox from "./AccountBox";
import { loadHistory, openHistory, removeHistory, scoreOf, type HistoryEntry } from "@/lib/client/store";

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function History() {
  const router = useRouter();
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => setList(loadHistory()), []);
  const onSynced = useCallback((l: HistoryEntry[]) => setList(l), []);

  if (!list) return <div className="py-24 text-center text-sm text-muted">Loading…</div>;

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your checks</h1>
      <p className="mt-1 text-sm text-muted">
        Every job you&rsquo;ve checked your CV against, with your roadmap progress. Re-check a job after updating your CV to see how far you&rsquo;ve come.
      </p>
      <AccountBox onSynced={onSynced} />

      {list.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="font-medium">No checks yet</p>
          <p className="mt-1 text-sm text-muted">Upload your CV and pick a job to start.</p>
          <Link href="/" className="btn mt-5">Check my CV</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          <AnimatePresence initial={false}>
            {list.map((e, i) => {
              const score = scoreOf(e.analysis);
              const done = e.roadmap.tasks.filter((t) => t.done).length;
              const steps = e.roadmap.tasks.length;
              const gained = e.previous ? score.shown - e.previous.shown : 0;
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.04 } }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
                  className="rounded-2xl border border-line bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.job ? e.job.title : e.analysis.roleTitle}</p>
                      <p className="truncate text-sm text-muted">
                        {e.job ? `${e.job.company} · ` : "Pasted job · "}
                        {when(e.savedAt)}
                      </p>
                    </div>
                    {e.analysis.preview && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">Free preview</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
                      {score.shown} of {score.total} requirements shown
                    </span>
                    {steps > 0 && (
                      <span className="rounded-full bg-paper px-2.5 py-1 text-muted">
                        Roadmap {done}/{steps} done
                      </span>
                    )}
                    {e.previous && gained !== 0 && (
                      <span className={`rounded-full px-2.5 py-1 font-medium ${gained > 0 ? "bg-accent-soft text-accent" : "bg-bad-soft text-bad"}`}>
                        {gained > 0 ? "▲" : "▼"} {Math.abs(gained)} since {when(e.previous.at)}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      className="btn"
                      onClick={() => {
                        openHistory(e);
                        router.push("/results");
                      }}
                    >
                      Open
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        openHistory(e);
                        router.push(e.jobId ? `/?job=${encodeURIComponent(e.jobId)}` : "/?recheck=1");
                      }}
                    >
                      Re-check with updated CV
                    </button>
                    {confirming === e.id ? (
                      <span className="ml-auto flex items-center gap-2 text-sm">
                        <span className="text-muted">Delete this check?</span>
                        <button className="font-medium text-bad underline" onClick={() => { setList(removeHistory(e.id)); setConfirming(null); }}>
                          Delete
                        </button>
                        <button className="text-muted underline" onClick={() => setConfirming(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="ml-auto text-sm text-muted underline-offset-4 hover:text-bad hover:underline" onClick={() => setConfirming(e.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
