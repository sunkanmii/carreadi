"use client";
import { useCallback, useEffect, useState } from "react";
import { clientLocale } from "@/lib/client/locale";
import { codeProblem, type DiscountCode } from "@/lib/codes";
import { PASSES, type PassId } from "@/lib/plans";
import { useText } from "@/lib/useText";

/** A timestamp as the "YYYY-MM-DDTHH:mm" local time a datetime-local input wants. */
function localInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/** Admin: make discount codes, see how often each was used, and switch them off. */
export default function AdminCodes({ token }: { token: string }) {
  const tr = useText();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [made, setMade] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState({ percent: "100", count: "1", code: "", plan: "", maxUses: "1", endsAt: localInput(Date.now() + 7 * 864e5), note: "" });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      const res = await fetch("/api/admin/codes", {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; codes?: unknown[] };
      if (!res.ok) throw new Error(j.error || "Failed");
      return j;
    },
    [token],
  );
  const refresh = useCallback(async () => {
    try {
      setCodes(((await call("GET")).codes ?? []) as DiscountCode[]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }, [call]);
  useEffect(() => void refresh(), [refresh]);

  const many = Number(form.count) > 1;
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await call("POST", {
        action: "create",
        percent: Number(form.percent),
        count: Number(form.count),
        code: many ? undefined : form.code.trim() || undefined,
        plan: form.plan || null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        expiresAt: form.endsAt ? new Date(form.endsAt).getTime() : null,
        note: form.note,
      });
      setMade((r.codes ?? []) as string[]);
      setForm((f) => ({ ...f, code: "" }));
      await refresh();
    } catch (err) {
      setMade([]);
      setMsg(err instanceof Error ? err.message : "Failed");
    }
    setBusy(false);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  }
  const link = (code: string) => `${window.location.origin}/plans?code=${code}`;
  const state = (c: DiscountCode) => {
    const p = codeProblem(c);
    return p === "used_up" ? tr("Used up") : p === "ended" ? (c.active ? tr("Expired") : tr("Switched off")) : tr("Live");
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">{tr("Discount codes")}</h2>
      <form onSubmit={create} className="card grid gap-3 p-4 text-sm sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dc-percent">{tr("Discount (%)")}</label>
          <input id="dc-percent" type="number" min={1} max={100} required className="field" value={form.percent} onChange={set("percent")} />
          <p className="mt-1 text-xs text-muted">{tr("100 makes the pass free, with no payment page.")}</p>
        </div>
        <div>
          <label className="label" htmlFor="dc-plan">{tr("Works for")}</label>
          <select id="dc-plan" className="field" value={form.plan} onChange={set("plan")}>
            <option value="">{tr("Any pass")}</option>
            {(["day", "week"] as PassId[]).map((id) => <option key={id} value={id}>{tr(PASSES[id].name)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dc-count">{tr("How many codes")}</label>
          <input id="dc-count" type="number" min={1} max={200} required className="field" value={form.count} onChange={set("count")} />
        </div>
        <div>
          <label className="label" htmlFor="dc-uses">{tr("Uses per code")}</label>
          <input id="dc-uses" type="number" min={1} max={100000} className="field" value={form.maxUses} onChange={set("maxUses")} placeholder={tr("No limit")} />
        </div>
        <div>
          <label className="label" htmlFor="dc-ends">{tr("Stops working on")}</label>
          <input id="dc-ends" type="datetime-local" min={localInput(Date.now())} max={localInput(Date.now() + 366 * 864e5)} className="field" value={form.endsAt} onChange={set("endsAt")} />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {[1, 3, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setForm((f) => ({ ...f, endsAt: localInput(Date.now() + d * 864e5) }))}
                className="rounded-full border border-line bg-white px-2.5 py-1 hover:border-ink/40 hover:bg-paper">
                {d === 1 ? tr("+1 day") : tr("+{count} days", { count: d })}
              </button>
            ))}
            <button type="button" onClick={() => setForm((f) => ({ ...f, endsAt: "" }))}
              className={`rounded-full border px-2.5 py-1 hover:border-ink/40 hover:bg-paper ${form.endsAt ? "border-line bg-white" : "border-accent bg-accent-soft text-accent"}`}>
              {tr("Never")}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            {form.endsAt ? tr("Ends {date}", { date: new Date(form.endsAt).toLocaleString(clientLocale(), { dateStyle: "medium", timeStyle: "short" }) }) : tr("No end date.")}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="dc-code">{tr("Your own code (optional)")}</label>
          <input dir="ltr" id="dc-code" maxLength={24} autoComplete="off" className="field uppercase" value={many ? "" : form.code} onChange={set("code")} disabled={many} placeholder={many ? tr("Random codes") : "CAREERDAY"} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="dc-note">{tr("Note for you (optional)")}</label>
          <input dir="auto" id="dc-note" maxLength={100} className="field" value={form.note} onChange={set("note")} />
        </div>
        <div className="sm:col-span-2">
          <button className="btn" disabled={busy}>{many ? tr("Make {count} codes", { count: Number(form.count) }) : tr("Make code")}</button>
          {msg && <p role="alert" className="mt-2 text-sm text-bad">{tr(msg)}</p>}
        </div>
      </form>

      {made.length > 0 && (
        <div className="mt-3 rounded-2xl bg-accent-soft p-4 text-sm">
          <p className="font-medium text-accent">{tr("Created. Copy them now to hand out:")}</p>
          <pre dir="ltr" className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs select-all">{made.join("\n")}</pre>
          <button className="btn-ghost mt-2" onClick={() => copy(made.join("\n"), "made")}>{copied === "made" ? tr("Copied ✓") : tr("Copy all")}</button>
        </div>
      )}

      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white text-sm">
        {codes.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span className={codeProblem(c) ? "text-muted" : ""}>
              <code dir="ltr" className="font-semibold select-all">{c.code}</code>{" "}
              <span className="text-xs">
                · {c.percent >= 100 ? tr("Free") : tr("-{percent}%", { percent: c.percent })} · {c.plan ? tr(PASSES[c.plan].name) : tr("Any pass")} ·{" "}
                {c.max_uses == null ? tr("Used {used}", { used: c.used }) : tr("Used {used} of {max}", { used: c.used, max: c.max_uses })}
                {c.expires_at ? " · " + tr("until {date}", { date: new Date(c.expires_at).toLocaleString(clientLocale(), { dateStyle: "medium", timeStyle: "short" }) }) : ""} · {state(c)}
                {c.note ? ` · ${c.note}` : ""}
              </span>
            </span>
            <span className="flex gap-3 text-xs">
              <button className="underline" onClick={() => copy(link(c.code), c.code)}>{copied === c.code ? tr("Copied ✓") : tr("Copy link")}</button>
              <button
                className={`underline ${c.active ? "text-bad" : ""}`}
                onClick={() => call("POST", { action: "set_active", code: c.code, active: !c.active }).then(refresh, (e) => setMsg(String(e.message)))}
              >
                {c.active ? tr("Switch off") : tr("Switch on")}
              </button>
            </span>
          </li>
        ))}
        {!codes.length && <li className="px-4 py-2.5 text-muted">{tr("No codes yet.")}</li>}
      </ul>
    </section>
  );
}
