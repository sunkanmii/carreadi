"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CAREER_PATHS } from "@/lib/careers";
import { BOARDS } from "@/lib/jobs/boards";
import { EMPLOYER_SOURCES, EXTRA_SOURCES } from "@/lib/types";

const ALL_SOURCES = [...EMPLOYER_SOURCES, ...EXTRA_SOURCES.map((s) => s.id)].join(",");

/** Real, checkable figures only: the live job count is fetched, the rest come from the code. */
export default function Stats() {
  const [jobs, setJobs] = useState<number | null>(null);
  useEffect(() => {
    fetch(`/api/jobs?sources=${ALL_SOURCES}`)
      .then((r) => r.json() as Promise<{ total?: number }>)
      .then((d) => d.total && setJobs(Math.floor(d.total / 100) * 100))
      .catch(() => {});
  }, []);

  const items = [
    jobs ? `${jobs.toLocaleString()}+ live jobs` : "Live jobs",
    `${BOARDS.length} job boards`,
    `${CAREER_PATHS.length} career paths`,
    "Results in ~30 seconds",
  ];
  return (
    <motion.ul
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted"
    >
      {items.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          {t}
        </li>
      ))}
    </motion.ul>
  );
}
