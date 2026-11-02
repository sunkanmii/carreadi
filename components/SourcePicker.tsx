"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { track } from "@/lib/client/analytics";
import { load, save } from "@/lib/client/store";
import { EMPLOYER_SOURCES, EXTRA_SOURCES, PROVIDER_NAMES, type Provider } from "@/lib/types";

/** The user's chosen job sources, remembered in this browser. Starts with employer career pages only. */
export function useSources() {
  const [sources, setSources] = useState<Provider[]>(EMPLOYER_SOURCES);
  useEffect(() => {
    const s = load().sources;
    if (s?.length) setSources(s);
  }, []);
  const update = (next: Provider[]) => {
    setSources(next);
    save({ sources: next });
  };
  return [sources, update] as const;
}

export default function SourcePicker({ value, onChange }: { value: Provider[]; onChange: (v: Provider[]) => void }) {
  const [open, setOpen] = useState(false);
  const extras = EXTRA_SOURCES.filter((s) => value.includes(s.id)).length;
  const employers = EMPLOYER_SOURCES.filter((s) => value.includes(s)).length;

  const toggle = (id: Provider, on: boolean) => {
    const next = on ? [...value, id] : value.filter((v) => v !== id);
    if (!next.length) return; // at least one source
    track("job_source_toggled", { source: id, on });
    onChange(next);
  };

  const summary =
    employers === EMPLOYER_SOURCES.length && !extras
      ? "Company career pages"
      : `${employers} company source${employers === 1 ? "" : "s"}${extras ? ` + ${extras} more` : ""}`;

  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 text-muted hover:text-ink">
        <span>Job sources: <b className="font-medium text-ink">{summary}</b></span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} aria-hidden>▾</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="mt-2 grid gap-4 rounded-xl bg-paper p-3 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-1.5 font-medium">Company career pages</legend>
                <p className="mb-2 text-muted">Posted directly by the employer.</p>
                {EMPLOYER_SOURCES.map((id) => (
                  <Check key={id} label={PROVIDER_NAMES[id]} checked={value.includes(id)} onChange={(on) => toggle(id, on)} />
                ))}
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 font-medium">More remote-job sites</legend>
                <p className="mb-2 text-muted">Collected from many companies. Check each posting.</p>
                {EXTRA_SOURCES.map((s) => (
                  <Check key={s.id} label={PROVIDER_NAMES[s.id]} note={s.note} checked={value.includes(s.id)} onChange={(on) => toggle(s.id, on)} />
                ))}
              </fieldset>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Check({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1">
      <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-ink">{label}</span>
        {note && <span className="block text-muted">{note}</span>}
      </span>
    </label>
  );
}
