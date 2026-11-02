"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { track } from "@/lib/client/analytics";
import { api, postJson } from "@/lib/client/http";
import { Spinner } from "./Analyzer";

export default function RequestForm() {
  const [f, setF] = useState({ company: "", url: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ status: string; message: string }>("/api/requests", postJson(f));
      track("job_requested", { status: r.status });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {done ? (
        <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card p-6 text-center">
          <p className="font-medium">{done}</p>
          <button className="btn-ghost mt-4" onClick={() => { setDone(""); setF({ company: "", url: "", note: "" }); }}>Request another</button>
        </motion.div>
      ) : (
        <motion.form key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="company">Company</label>
            <input id="company" required minLength={2} maxLength={100} className="field" placeholder="e.g. Moniepoint" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="url">Careers page or job link</label>
            <input id="url" required type="url" maxLength={500} className="field" placeholder="https://jobs.lever.co/company" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">
              Links on Greenhouse, Lever, Ashby, Workable or Recruitee can be added fastest. Other careers pages are reviewed by hand.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="note">Anything we should know? (optional)</label>
            <textarea id="note" rows={2} maxLength={500} className="field resize-y" placeholder="e.g. They hire nurses in Lagos" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">Please don&rsquo;t include personal details.</p>
          </div>
          {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Checking the link…" : "Send request"}
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
