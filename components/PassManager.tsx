"use client";
import { useText, displayValue } from "@/lib/useText";

import { useEffect, useState } from "react";
import { daysLeft, getPass, passStatus, restore, type PassStatus } from "@/lib/client/pass";
import { PASSES } from "@/lib/plans";
import { api, postJson } from "@/lib/client/http";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useTurnstile } from "./Turnstile";

/** Shows the active pass (with its restore code) or lets someone restore a pass bought elsewhere. */
export default function PassManager() {
  const tr = useText();
  const [status, setStatus] = useState<PassStatus | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<"" | "code" | "email">("");
  const [email, setEmail] = useState("");
  const human = useTurnstile("support");

  useEffect(() => {
    passStatus().then(setStatus).catch(() => setStatus({ active: false }));
  }, []);

  async function onLost(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const r = await api<{ message: string }>("/api/support", postJson({ email: email.trim(), turnstile: human.token }));
      setMsg(r.message);
      setOpen("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : tr("Couldn't send that."));
    } finally {
      human.reset();
    }
  }

  async function onRestore(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      setStatus(await restore(code.trim()));
      setMsg(tr("Pass restored on this device. Your other device is signed out of it."));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : tr("Couldn't restore that pass."));
    }
  }

  if (status?.owner) return null;
  if (status?.active && status.plan)
    return (
      <div className="rounded-2xl bg-accent-soft p-4 text-sm">
        <p className="font-medium text-accent">{tr("Active pass: {plan} · Days left: {days} · Analyses left: {analyses}", { plan: tr(PASSES[status.plan].name), days: daysLeft(status.expiresAt), analyses: status.analysesLeft ?? 0 })}</p>
        <p className="mt-1 text-muted">
          {tr("Restore code (to use it on another device): ")}<code className="ph-mask rounded bg-white px-1.5 py-0.5 text-xs text-ink select-all">{getPass()?.reference}</code>
        </p>
      </div>
    );

  return (
    <div className="text-center text-xs text-muted">
      {!open && (
        <p>
          {tr("Already paid?")}{" "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={() => setOpen("code")}>{tr("Restore with your code")}</button>
          {" · "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={() => setOpen("email")}>{tr("Lost your code?")}</button>
        </p>
      )}
      {open === "email" && (
        <form onSubmit={onLost} className="mx-auto max-w-md">
          <p className="mb-2">{tr("Enter the email you used at checkout. We’ll send your restore code there.")}</p>
          <div className="flex gap-2">
            <label htmlFor="lost-email" className="sr-only">{tr("Email")}</label>
            <input dir="auto" id="lost-email" type="email" required maxLength={254} className="ph-mask field py-2 text-xs" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn-ghost shrink-0" disabled={!human.ready}>{tr("Send")}</button>
          </div>
          <div className="mt-2 flex justify-center">{human.widget}</div>
        </form>
      )}
      {open === "code" && (
        <form onSubmit={onRestore} className="mx-auto flex max-w-md gap-2">
          <label htmlFor="restore" className="sr-only">{tr("Restore code")}</label>
          <input dir="auto" id="restore" className="field py-2 text-xs" placeholder="carreadi-…" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-ghost shrink-0">{tr("Restore")}</button>
        </form>
      )}
      {msg && <p className="mt-2">{tr(msg)}</p>}
      <p className="mt-3">
        {tr("Payment problem? ")}<a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-ink">{SUPPORT_EMAIL}</a>
      </p>
    </div>
  );
}
