"use client";
import { useText, displayValue } from "@/lib/useText";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/client/analytics";
import { copyChecklist, downloadDocx, downloadIcs, printReport, reportOf } from "@/lib/client/export";
import type { Saved } from "@/lib/client/store";

type Kind = "word" | "pdf" | "calendar" | "checklist";

const OPTIONS: { kind: Kind; label: string; hint: string }[] = [
  { kind: "word", label: "Word document", hint: "Report and to-do list for Word or Google Docs" },
  { kind: "pdf", label: "PDF", hint: "Print or save a clean report" },
  { kind: "calendar", label: "Add to calendar", hint: "Each step as a reminder, at your pace" },
  { kind: "checklist", label: "Copy as checklist", hint: "Paste into Notes, OneNote, Notion or WhatsApp" },
];

/** Exports of full results. Free previews see it locked, with the way to unlock it. */
export default function ExportMenu({ data }: { data: Saved }) {
  const tr = useText();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const locked = !!data.analysis?.preview;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function run(kind: Kind) {
    const r = reportOf(data);
    try {
      if (kind === "word") downloadDocx(r);
      if (kind === "pdf" && !printReport(r)) throw new Error("popup");
      if (kind === "calendar") downloadIcs(r);
      if (kind === "checklist") await copyChecklist(r);
      setDone(kind === "checklist" ? tr("Checklist copied ✓") : kind === "pdf" ? tr("Report opened. Choose “Save as PDF” ✓") : tr("Downloaded ✓"));
      track("results_exported", { kind });
    } catch {
      setDone(kind === "pdf" ? tr("Allow pop-ups for this site, then try again.") : tr("Couldn’t export. Please try again."));
    }
    setOpen(false);
    setTimeout(() => setDone(""), 3500);
  }

  return (
    <div ref={ref} className="relative">
      <button ref={trigger} className="btn-ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{tr("{value0}Export ▾", { value0: displayValue(locked ? "🔒 " : "") })}</button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            className="mt-2 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-line bg-white"
          >
            {locked ? (
              <div className="p-4 text-sm">
                <p className="font-medium">{tr("Export comes with a pass")}</p>
                <p className="mt-1 text-muted">{tr("Take your full report and roadmap to Word, PDF, your calendar or your notes.")}</p>
                <Link href="/plans" className="btn mt-3 w-full">{tr("See passes")}</Link>
              </div>
            ) : (
              <ul className="py-1">
                {OPTIONS.map((o) => (
                  <li key={o.kind}>
                    <button className="w-full px-4 py-2.5 text-start hover:bg-paper" onClick={() => run(o.kind)}>
                      <span className="block text-sm font-medium">{tr(o.label)}</span>
                      <span className="block text-xs text-muted">{tr(o.hint)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {done && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="absolute end-0 mt-2 w-72 max-w-[calc(100vw-2.5rem)] text-xs text-accent">
            {done}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
