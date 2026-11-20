"use client";
import { useText } from "@/lib/useText";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { track } from "@/lib/client/analytics";
import { api, postJson } from "@/lib/client/http";
import { Spinner } from "./Analyzer";
import { useTurnstile } from "./Turnstile";

export default function RequestForm() {
  const tr = useText();
  const [f, setF] = useState({ company: "", url: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const human = useTurnstile("request");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ status: string; message: string }>("/api/requests", postJson({ ...f, turnstile: human.token }));
      track("job_requested", { status: r.status });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Couldn't send that. Try again."));
    } finally {
      human.reset();
      setBusy(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {done ? (
        <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card p-6 text-center">
          <p role="status" className="font-medium">{tr(done)}</p>
          <button className="btn-ghost mt-4" onClick={() => { setDone(""); setF({ company: "", url: "", note: "" }); }}>{tr("Request another")}</button>
        </motion.div>
      ) : (
        <motion.form key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="company">{tr("Company")}</label>
            <input dir="auto" id="company" required minLength={2} maxLength={100} className="field" placeholder={tr("e.g. Moniepoint")} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="url">{tr("Careers page or job link")}</label>
            <input dir="auto" id="url" required type="url" maxLength={500} className="field" placeholder="https://jobs.lever.co/company" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">{tr("Links on Greenhouse, Lever, Ashby, Workable or Recruitee can be added fastest. Other careers pages are reviewed by hand.")}</p>
          </div>
          <div>
            <label className="label" htmlFor="note">{tr("Anything we should know? (optional)")}</label>
            <textarea dir="auto" id="note" rows={2} maxLength={500} className="field resize-y" placeholder={tr("e.g. They hire nurses in Lagos")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">{tr("Please don’t include personal details.")}</p>
          </div>
          {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{tr(error)}</p>}
          {human.widget}
          <button className="btn w-full" disabled={busy || !human.ready}>
            {busy && <Spinner />}
            {busy ? tr("Checking the link…") : tr("Send request")}
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
