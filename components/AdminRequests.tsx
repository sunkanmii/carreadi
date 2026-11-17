"use client";
import { clientLocale } from "@/lib/client/locale";

import { useText, displayValue } from "@/lib/useText";

import { useCallback, useEffect, useState } from "react";
import { PROVIDER_NAMES, type Provider } from "@/lib/types";
import { safeHref } from "@/lib/url";
import { getSession } from "@/lib/client/session";
import { passStatus } from "@/lib/client/pass";
import AdminCodes from "./AdminCodes";

interface Req {
  id: number;
  created_at: string;
  company: string;
  url: string;
  note: string;
  provider: Provider | null;
  token: string | null;
  jobs: number | null;
  status: "pending" | "approved" | "rejected";
}
interface Support {
  id: number;
  created_at: number;
  email: string;
  note: string;
  status: "open" | "resolved";
  passes: { reference: string; plan: string; status: string; expires_at: number | null; analyses_used: number; analyses_limit: number }[];
}
interface Board {
  provider: Provider;
  token: string;
  company: string;
}

// The token lives only in this tab (sessionStorage) and is sent as a header, never in the URL.
const KEY = "carreadi:admin";

export default function AdminRequests() {
  const tr = useText();
  const [token, setToken] = useState("");
  const [data, setData] = useState<{ requests: Req[]; approved: Board[]; support: Support[] } | null>(null);
  const [msg, setMsg] = useState("");

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      const res = await fetch("/api/admin/requests", {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; jobs?: number };
      if (!res.ok) throw new Error(j.error || tr("Error {value0}", { value0: displayValue(res.status) }));
      return j;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    try {
      setData((await call("GET")) as unknown as { requests: Req[]; approved: Board[]; support: Support[] });
      setMsg("");
    } catch (e) {
      setData(null);
      setMsg(e instanceof Error ? e.message : tr("Failed"));
    }
  }, [call]);

  useEffect(() => {
    void passStatus().then((s) => { if (s.owner) setToken(getSession() ?? ""); }).catch(() => {});
    try {
      setToken(sessionStorage.getItem(KEY) ?? "");
    } catch {}
  }, []);
  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  async function act(body: object, ok: string) {
    try {
      const r = await call("POST", body);
      setMsg(r.jobs !== undefined ? tr("{value0} ({value1} jobs). Live within ~30 minutes.", { value0: displayValue(ok), value1: displayValue(r.jobs) }) : ok);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tr("Failed"));
    }
  }

  if (!data)
    return (
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = new FormData(e.currentTarget).get("t") as string;
          try {
            sessionStorage.setItem(KEY, t);
          } catch {}
          setToken(t);
        }}
      >
        <p className="text-sm text-muted">{tr("Owners can ")}<a href="/signin" className="underline">{tr("sign in by email")}</a> {tr(" to open admin tools, or use an admin token below.")}</p>
        <label className="label" htmlFor="t">{tr("Admin token")}</label>
        <input dir="auto" id="t" name="t" type="password" autoComplete="off" className="field" />
        {msg && <p className="text-sm text-bad">{tr(msg)}</p>}
        <button className="btn">{tr("Open")}</button>
      </form>
    );

  const pending = data.requests.filter((r) => r.status === "pending");
  const handled = data.requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      {msg && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">{tr(msg)}</p>}
      <AdminCodes token={token} />
      <section>
        <h2 className="mb-3 text-sm font-semibold">{tr("Lost passes ({value0} open)", { value0: displayValue(data.support.filter((x) => x.status === "open").length) })}</h2>
        {!data.support.some((x) => x.status === "open") && <p className="text-sm text-muted">{tr("No one needs help.")}</p>}
        <ul className="space-y-2">
          {data.support
            .filter((x) => x.status === "open")
            .map((x) => {
              const live = x.passes.find((p) => p.status === "paid" && (p.expires_at ?? 0) > Date.now());
              const body = live
                ? `Hi,

Here is the restore code for your Carreadi ${live.plan} pass:

${live.reference}

Open https://carreadi.sunkanmifafowora.workers.dev/plans, choose "Restore with your code" and paste it.
`
                : tr("Hi,\n\nWe couldn't find an active pass for this email. Could you reply with your Bachs receipt?\n");
              return (
                <li key={x.id} className="card p-4 text-sm">
                  <p className="font-medium">{x.email}</p>
                  <p className="text-xs text-muted">{new Date(x.created_at).toLocaleString(clientLocale())}</p>
                  {x.note && <p className="mt-1 text-xs">{tr("“{value0}”", { value0: displayValue(x.note) })}</p>}
                  <p className="mt-2 text-xs">
                    {x.passes.length
                      ? x.passes.map((p) => (
                          <span key={p.reference} className="me-2 inline-block rounded bg-paper px-1.5 py-0.5">
                            {p.plan} · {p.status}
                            {p.expires_at ? tr(" · ends {value0}", { value0: displayValue(new Date(p.expires_at).toLocaleDateString(clientLocale())) }) : ""} · {p.analyses_used}/{p.analyses_limit} {tr(" used ·")}{" "}
                            <code className="select-all">{p.reference}</code>
                          </span>
                        ))
                      : tr("No pass found for this email (they may have paid without one; ask for the Bachs receipt).")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a className="btn px-4 py-2" href={`mailto:${encodeURIComponent(x.email)}?subject=${encodeURIComponent(tr("Your Carreadi pass"))}&body=${encodeURIComponent(body)}`}>
                      {live ? tr("Email their restore code") : tr("Reply")}
                    </a>
                    <button className="btn-ghost" onClick={() => act({ action: "resolve_support", id: x.id }, tr("Marked resolved"))}>{tr("Mark resolved")}</button>
                  </div>
                </li>
              );
            })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">{tr("Pending ({value0})", { value0: displayValue(pending.length) })}</h2>
        {!pending.length && <p className="text-sm text-muted">{tr("Nothing to review.")}</p>}
        <ul className="space-y-2">
          {pending.map((r) => (
            <li key={r.id} className="card p-4 text-sm">
              <ReqRow r={r} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.provider ? (
                  <ApproveButton defaultName={r.company} onApprove={(company) => act({ action: "approve", id: r.id, company }, tr("Added {value0}", { value0: displayValue(company) }))} />
                ) : (
                  <span className="text-xs text-muted">{tr("Not a supported board: add it by hand in lib/jobs/boards.ts if it has one.")}</span>
                )}
                <button className="btn-ghost" onClick={() => act({ action: "reject", id: r.id }, tr("Rejected"))}>{tr("Reject")}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">{tr("Added from requests ({value0})", { value0: displayValue(data.approved.length) })}</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
          {data.approved.map((b) => (
            <li key={`${b.provider}:${b.token}`} className="flex items-center justify-between px-4 py-2.5">
              <span>{b.company} <span className="text-muted">{tr("· {value0} / {value1}", { value0: displayValue(PROVIDER_NAMES[b.provider]), value1: displayValue(b.token) })}</span></span>
              <button className="text-xs text-bad underline" onClick={() => act({ action: "remove", provider: b.provider, token: b.token }, tr("Removed {value0}", { value0: displayValue(b.company) }))}>{tr("Remove")}</button>
            </li>
          ))}
          {!data.approved.length && <li className="px-4 py-2.5 text-muted">{tr("None yet.")}</li>}
        </ul>
      </section>

      {handled.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{tr("History")}</h2>
          <ul className="space-y-1 text-xs text-muted">
            {handled.slice(0, 50).map((r) => (
              <li key={r.id}>{tr("{value0} {value1} · {value2}", { value0: displayValue(r.status === "approved" ? "✓" : "✕"), value1: displayValue(r.company), value2: displayValue(new Date(r.created_at).toLocaleDateString(clientLocale())) })}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReqRow({ r }: { r: Req }) {
  const tr = useText();
  return (
    <div>
      <p className="font-medium">{r.company}</p>
      {/* Untrusted link from a visitor: http(s) only, no referrer, never auto-opened. */}
      <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs underline">{r.url}</a>
      <p className="mt-1 text-xs text-muted">{tr("{value0} ·{value1}{value2}", { value0: displayValue(r.provider ? `${PROVIDER_NAMES[r.provider]} board "${r.token}" · ${r.jobs ?? "?"} open roles` : tr("Board not recognised")), value1: displayValue(" "), value2: displayValue(new Date(r.created_at).toLocaleString(clientLocale())) })}</p>
      {r.note && <p className="mt-1 text-xs">{tr("“{value0}”", { value0: displayValue(r.note) })}</p>}
    </div>
  );
}

function ApproveButton({ defaultName, onApprove }: { defaultName: string; onApprove: (company: string) => void }) {
  const tr = useText();
  const [name, setName] = useState(defaultName);
  return (
    <span className="flex items-center gap-2">
      <input dir="auto" aria-label={tr("Company name to show")} className="field w-44 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn px-4 py-2" onClick={() => onApprove(name.trim())} disabled={name.trim().length < 2}>{tr("Approve")}</button>
    </span>
  );
}
