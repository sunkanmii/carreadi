"use client";
import { useCallback, useEffect, useState } from "react";
import { clientLocale } from "@/lib/client/locale";
import { displayValue, useText } from "@/lib/useText";

interface Item {
  id: number;
  created_at: number;
  kind: "idea" | "bug" | "praise" | "other";
  rating: number | null;
  message: string;
  email: string;
  page: string;
  locale: string;
  status: "new" | "done";
}
interface Stats {
  rated: number;
  average: number | null;
  total: number;
}

/** Admin: read what visitors sent through the Feedback button, reply by email, and tick items off. */
export default function AdminFeedback({ token }: { token: string }) {
  const tr = useText();
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState("");

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      const res = await fetch("/api/admin/feedback", {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; feedback?: Item[]; stats?: Stats };
      if (!res.ok) throw new Error(j.error || "Failed");
      return j;
    },
    [token],
  );
  const refresh = useCallback(async () => {
    try {
      const j = await call("GET");
      setItems(j.feedback ?? []);
      setStats(j.stats ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }, [call]);
  useEffect(() => void refresh(), [refresh]);

  async function act(body: object) {
    try {
      await call("POST", body);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  const open = items.filter((i) => i.status === "new");
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">{tr("Feedback ({value0} new)", { value0: displayValue(open.length) })}</h2>
      {stats && stats.total > 0 && (
        <p className="mb-3 text-xs text-muted">
          {tr("Last 30 days: {value0} messages", { value0: displayValue(stats.total) })}
          {stats.average !== null && ` · ${stats.average.toFixed(1)} / 5 (${stats.rated})`}
        </p>
      )}
      {msg && <p className="mb-2 text-sm text-bad">{tr(msg)}</p>}
      {!items.length && <p className="text-sm text-muted">{tr("No feedback yet.")}</p>}
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className={`card p-4 text-sm ${i.status === "done" ? "opacity-60" : ""}`}>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className={`rounded px-1.5 py-0.5 ${i.kind === "bug" ? "bg-bad-soft text-bad" : "bg-paper"}`}>{i.kind}</span>
              {i.rating !== null && <span aria-label={`${i.rating} / 5`}>{"★".repeat(i.rating)}{"☆".repeat(5 - i.rating)}</span>}
              <span>{new Date(i.created_at).toLocaleString(clientLocale())}</span>
              {i.page && <code>{i.page}</code>}
              {i.locale && <span>{i.locale}</span>}
            </p>
            {i.message && <p dir="auto" className="mt-2 whitespace-pre-wrap">{i.message}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {i.email && (
                <a className="btn-ghost" href={`mailto:${encodeURIComponent(i.email)}?subject=${encodeURIComponent(tr("Your Carreadi feedback"))}`}>{tr("Reply")}</a>
              )}
              {i.status === "new" && <button className="btn-ghost" onClick={() => act({ action: "done", id: i.id })}>{tr("Mark done")}</button>}
              <button className="text-xs text-bad underline" onClick={() => act({ action: "delete", id: i.id })}>{tr("Delete")}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
