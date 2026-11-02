"use client";

import { useEffect, useState } from "react";
import { daysLeft, getPass, passStatus, restore, type PassStatus } from "@/lib/client/pass";
import { PASSES } from "@/lib/plans";
import { api, postJson } from "@/lib/client/http";

/** Shows the active pass (with its restore code) or lets someone restore a pass bought elsewhere. */
export default function PassManager() {
  const [status, setStatus] = useState<PassStatus | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<"" | "code" | "email">("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    passStatus().then(setStatus).catch(() => setStatus({ active: false }));
  }, []);

  async function onLost(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const r = await api<{ message: string }>("/api/support", postJson({ email: email.trim() }));
      setMsg(r.message);
      setOpen("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't send that.");
    }
  }

  async function onRestore(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      setStatus(await restore(code.trim()));
      setMsg("Pass restored on this device. Your other device is signed out of it.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't restore that pass.");
    }
  }

  if (status?.active && status.plan)
    return (
      <div className="rounded-2xl bg-accent-soft p-4 text-sm">
        <p className="font-medium text-accent">
          Your {PASSES[status.plan].name.toLowerCase()} is active · {daysLeft(status.expiresAt)} day{daysLeft(status.expiresAt) === 1 ? "" : "s"} left ·{" "}
          {status.analysesLeft} analyses left
        </p>
        <p className="mt-1 text-muted">
          Restore code (to use it on another device): <code className="ph-mask rounded bg-white px-1.5 py-0.5 text-xs text-ink select-all">{getPass()?.reference}</code>
        </p>
      </div>
    );

  return (
    <div className="text-center text-xs text-muted">
      {!open && (
        <p>
          Already paid?{" "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={() => setOpen("code")}>Restore with your code</button>
          {" · "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={() => setOpen("email")}>Lost your code?</button>
        </p>
      )}
      {open === "email" && (
        <form onSubmit={onLost} className="mx-auto max-w-md">
          <p className="mb-2">Enter the email you used at checkout. We&rsquo;ll send your restore code there.</p>
          <div className="flex gap-2">
            <label htmlFor="lost-email" className="sr-only">Email</label>
            <input id="lost-email" type="email" required maxLength={254} className="ph-mask field py-2 text-xs" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn-ghost shrink-0">Send</button>
          </div>
        </form>
      )}
      {open === "code" && (
        <form onSubmit={onRestore} className="mx-auto flex max-w-md gap-2">
          <label htmlFor="restore" className="sr-only">Restore code</label>
          <input id="restore" className="field py-2 text-xs" placeholder="carreadi-…" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-ghost shrink-0">Restore</button>
        </form>
      )}
      {msg && <p className="mt-2">{msg}</p>}
    </div>
  );
}
