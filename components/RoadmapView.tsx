"use client";
import { useText, displayValue } from "@/lib/useText";

import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { remainingHours, type Roadmap, type Task } from "@/lib/roadmap";
import { track } from "@/lib/client/analytics";
import { safeHref } from "@/lib/url";

const spring = { type: "spring", stiffness: 380, damping: 30 } as const;
const PACES = [3, 5, 10, 20, 40];
// Full-time focus. The nudge only promises what this pace actually gets them to.
const LOCK_IN_PACE = 40;

export default function RoadmapView({ roadmap, onChange, locale = "en" }: { roadmap: Roadmap; onChange: (r: Roadmap) => void; locale?: string }) {
  const tr = useText();
  const weeksText = (hours: number, pace: number) => Math.ceil(hours / pace) <= 1 ? tr("within a week") : tr("about {weeks} weeks", { weeks: Math.ceil(hours / pace) });
  const [editing, setEditing] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const total = roadmap.tasks.length;
  const done = roadmap.tasks.filter((t) => t.done).length;
  const allDone = total > 0 && done === total;
  // Open tasks first (in priority order), finished ones slide to the bottom.
  const ordered = [...roadmap.tasks.filter((t) => !t.done), ...roadmap.tasks.filter((t) => t.done)];
  const currentId = ordered.find((t) => !t.done)?.id;
  const hoursLeft = remainingHours(roadmap);
  const pace = roadmap.pace ?? 5;

  const set = (id: string, patch: Partial<Task>) =>
    onChange({ ...roadmap, tasks: roadmap.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const toggle = (t: Task) => {
    if (!t.done) {
      setBurst(t.id);
      setTimeout(() => setBurst(null), 700);
    }
    track(t.done ? "task_reopened" : "task_completed", { custom: t.requirement === "Custom", done: done + (t.done ? -1 : 1), total });
    set(t.id, { done: !t.done });
  };
  const remove = (id: string) => onChange({ ...roadmap, tasks: roadmap.tasks.filter((t) => t.id !== id) });
  const add = () => {
    const id = `c-${Date.now().toString(36)}`;
    onChange({
      ...roadmap,
      tasks: [...roadmap.tasks, { id, title: tr("New task"), requirement: "Custom", deliverable: tr("What you'll be able to show"), resource: { name: "", url: "" }, priority: 3, done: false }],
    });
    track("task_added");
    setEditing(id);
  };

  if (!total)
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted">{tr("No gaps found for this job. Add your own tasks.")}</p>
        <button className="btn-ghost mt-4" onClick={add}>{tr("+ Add task")}</button>
      </div>
    );

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="card mb-6 flex items-center gap-5 p-5"
      >
        <ProgressRing value={done / total} />
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            <Counter value={done} /> <span className="text-base font-normal text-muted">{tr("of {value0} done", { value0: displayValue(total) })}</span>
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={allDone ? "all" : done}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-0.5 text-sm text-muted"
            >
              {allDone ? tr("Every gap closed. Time to apply.") : done === 0 ? tr("Start with the first step below.") : tr("{value0} to go. Keep the streak.", { value0: displayValue(total - done) })}
            </motion.p>
          </AnimatePresence>
          {hoursLeft > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              <span className="font-medium">≈ <Counter value={hoursLeft} /> {tr(" hours left")}</span>
              <span className="text-muted">{tr("· {value0} at", { value0: displayValue(weeksText(hoursLeft, pace)) })}</span>
              <select
                aria-label={tr("Hours per week")}
                className="rounded-lg border border-line bg-white px-1.5 py-0.5 text-sm"
                value={pace}
                onChange={(e) => { onChange({ ...roadmap, pace: Number(e.target.value) }); track("pace_changed", { hours_per_week: Number(e.target.value) }); }}
              >
                {PACES.map((p) => <option key={p} value={p}>{p === LOCK_IN_PACE ? tr("{value0} h/week (full-time)", { value0: displayValue(p) }) : tr("{value0} h/week", { value0: displayValue(p) })}</option>)}
              </select>
            </p>
          )}
          {/* Nudge: show how much sooner a focused pace finishes, computed from their own hours. */}
          <AnimatePresence>
            {hoursLeft > 0 && pace < LOCK_IN_PACE && Math.ceil(hoursLeft / LOCK_IN_PACE) < Math.ceil(hoursLeft / pace) && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                whileHover={{ x: 2 }}
                onClick={() => { onChange({ ...roadmap, pace: LOCK_IN_PACE }); track("pace_changed", { hours_per_week: LOCK_IN_PACE, from: "lock_in" }); }}
                className="mt-2 block text-start text-xs font-medium text-accent"
              >{tr("🔒 Lock in full-time ({value0} h/week) and you could finish {value1} →", { value0: displayValue(LOCK_IN_PACE), value1: weeksText(hoursLeft, LOCK_IN_PACE) })}</motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>{allDone && <Celebration />}</AnimatePresence>

      <p className="mb-3 text-xs text-muted">{tr("Tick a step once you can show its deliverable. Estimates are rough; edit them to fit you.")}</p>

      <div className="relative">
        {/* Timeline rail: grey track with a green fill that grows up from the bottom, where finished tasks collect. */}
        <div aria-hidden className="absolute top-3 bottom-3 start-[15px] w-0.5 rounded-full bg-line" />
        <motion.div
          aria-hidden
          className="absolute top-3 bottom-3 start-[15px] w-0.5 origin-bottom rounded-full bg-accent"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: done / total }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />

        <ul className="space-y-3">
          <AnimatePresence initial={true}>
            {ordered.map((t, i) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.05 } }}
                exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.2 } }}
                transition={spring}
                className="relative flex gap-4"
              >
                <Node task={t} index={roadmap.tasks.indexOf(t) + 1} current={t.id === currentId} bursting={burst === t.id} onToggle={() => toggle(t)} />

                <motion.div
                  layout="position"
                  whileHover={{ y: -2, boxShadow: "0 8px 24px -12px rgba(22,24,29,0.25)" }}
                  animate={{ opacity: 1 }}
                  className={`card min-w-0 flex-1 p-4 ${t.id === currentId ? "border-accent/40" : ""}`}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {editing === t.id ? (
                      <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                        <input dir="auto" aria-label={tr("Task")} className="field" value={t.title} onChange={(e) => set(t.id, { title: e.target.value })} />
                        <input dir="auto" aria-label={tr("Deliverable")} className="field" value={t.deliverable} onChange={(e) => set(t.id, { deliverable: e.target.value })} />
                        <label className="flex items-center gap-2 text-xs text-muted">
                          {tr("Estimated hours")}<input dir="auto"
                            type="number"
                            min={0}
                            max={300}
                            className="field w-24 py-1.5"
                            value={t.hours ?? ""}
                            onChange={(e) => set(t.id, { hours: e.target.value === "" ? undefined : Math.max(0, Math.min(300, Math.round(Number(e.target.value)))) })}
                          />
                        </label>
                        <div className="flex justify-between">
                          <button className="text-xs text-bad underline" onClick={() => remove(t.id)}>{tr("Delete task")}</button>
                          <button className="btn-ghost" onClick={() => setEditing(null)}>{tr("Save")}</button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-medium tracking-wide text-muted uppercase">{tr("Step {value0}", { value0: displayValue(roadmap.tasks.indexOf(t) + 1) })}</span>
                          {t.id === currentId && (
                            <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{tr("Up next")}</motion.span>
                          )}
                          {t.hours ? <span className="rounded-full bg-paper px-2 py-0.5 text-muted">{tr("≈ {value0} h", { value0: displayValue(t.hours) })}</span> : null}
                        </div>
                        <p className="text-sm font-medium">
                          <span lang={locale} dir="auto" className="relative">
                            {t.title}
                            {/* Strike-through draws across the title instead of snapping on. */}
                            <motion.span
                              aria-hidden
                              className="absolute top-1/2 start-0 h-px w-full origin-left bg-ink"
                              initial={false}
                              animate={{ scaleX: t.done ? 1 : 0 }}
                              transition={{ duration: 0.35, ease: "easeOut" }}
                            />
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-muted">{tr("→ {value0}", { value0: displayValue(t.deliverable) })}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          {t.requirement !== "Custom" && <span>{tr("For: {value0}", { value0: displayValue(t.requirement) })}</span>}
                          {t.resource.url && (
                            <a href={safeHref(t.resource.url)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink" onClick={() => track("resource_opened")}>{tr("{value0} ↗", { value0: displayValue(t.resource.name) })}</a>
                          )}
                          <button className="underline underline-offset-2 hover:text-ink" onClick={() => setEditing(t.id)}>{tr("Edit")}</button>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggle(t)}
                          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                            t.done ? "border border-line bg-white text-muted hover:text-ink" : t.id === currentId ? "bg-accent text-white hover:bg-accent/90" : "border border-line bg-white text-ink hover:border-ink/30"
                          }`}
                        >
                          {t.done ? tr("Undo") : tr("✓ Mark as done")}
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-ghost mt-4 ms-12" onClick={add}>{tr("+ Add task")}</motion.button>
    </div>
  );
}

/** The round checkbox on the timeline. */
function Node({ task, index, current, bursting, onToggle }: { task: Task; index: number; current: boolean; bursting: boolean; onToggle: () => void }) {
  const tr = useText();
  return (
    <div className="relative z-10 mt-3 size-8 shrink-0">
      {current && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-lg bg-accent"
          animate={{ scale: [1, 1.7], opacity: [0.35, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.button
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? tr("Mark {title} as not done", { title: task.title }) : tr("Mark {title} as done", { title: task.title })}
        onClick={onToggle}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.85 }}
        animate={{ backgroundColor: task.done ? "#1f5f4a" : "#ffffff", borderColor: task.done || current ? "#1f5f4a" : "#e7e5e1" }}
        transition={spring}
        className="relative flex size-8 items-center justify-center rounded-lg border-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {task.done ? (
            <motion.svg key="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
              <motion.path d="M5 12l5 5L20 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease: "easeOut" }} />
            </motion.svg>
          ) : null}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>{bursting && <Burst />}</AnimatePresence>
    </div>
  );
}

/** Small particle burst when a task is ticked. */
function Burst() {
  const tr = useText();
  const colors = ["#1f5f4a", "#3f9b7a", "#e0a526", "#16181d"];
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 size-1.5 rounded-full"
            style={{ backgroundColor: colors[i % colors.length] }}
            initial={{ x: "-50%", y: "-50%", scale: 1, opacity: 1 }}
            animate={{ x: `calc(-50% + ${Math.cos(angle) * 28}px)`, y: `calc(-50% + ${Math.sin(angle) * 28}px)`, scale: 0, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        );
      })}
    </span>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = useSpring(0, { stiffness: 90, damping: 18 });
  useEffect(() => v.set(value), [v, value]);
  const offset = useTransform(v, (x) => c * (1 - x));
  const pct = useTransform(v, (x) => `${Math.round(x * 100)}%`);
  return (
    <div className="relative size-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} style={{ strokeDashoffset: offset }} />
      </svg>
      <motion.span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">{pct}</motion.span>
    </div>
  );
}

function Counter({ value }: { value: number }) {
  const v = useSpring(0, { stiffness: 120, damping: 20 });
  useEffect(() => v.set(value), [v, value]);
  const text = useTransform(v, (x) => String(Math.round(x)));
  return <motion.span>{text}</motion.span>;
}

function Celebration() {
  const tr = useText();
  const colors = ["#1f5f4a", "#3f9b7a", "#e0a526", "#a33a2b", "#16181d"];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, height: 0 }}
      animate={{ opacity: 1, scale: 1, height: "auto" }}
      exit={{ opacity: 0, scale: 0.95, height: 0 }}
      transition={spring}
      className="relative mb-6 overflow-hidden rounded-2xl bg-accent p-5 text-center text-white"
    >
      {Array.from({ length: 24 }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute top-0 size-2 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, backgroundColor: colors[i % colors.length] === "#1f5f4a" ? "#fff" : colors[i % colors.length] }}
          initial={{ y: -12, rotate: 0, opacity: 1 }}
          animate={{ y: 120, rotate: 360 + i * 20, opacity: 0 }}
          transition={{ duration: 1.4 + (i % 5) * 0.2, delay: (i % 6) * 0.08, ease: "easeIn" }}
        />
      ))}
      <motion.p initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="relative font-semibold">{tr("Roadmap complete 🎉")}</motion.p>
      <p className="relative mt-1 text-sm text-white/80">{tr("Re-check your résumé to see what changed, then apply.")}</p>
    </motion.div>
  );
}
