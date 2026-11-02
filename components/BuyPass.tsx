"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { track } from "@/lib/client/analytics";
import { startCheckout, visitorCurrency } from "@/lib/client/pass";
import { formatPrice, PASSES, type Currency, type PassId } from "@/lib/plans";
import { Spinner } from "./Analyzer";

const PERKS: Record<PassId, string[]> = {
  day: ["Every gap, with steps and resources", "Your full roadmap", `${PASSES.day.analyses} full analyses for 24 hours`],
  week: ["Every gap, with steps and resources", "Your full roadmap", `${PASSES.week.analyses} full analyses for 7 days`],
};

export default function BuyPass({ compact = false }: { compact?: boolean }) {
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [busy, setBusy] = useState<PassId | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    visitorCurrency().then(setCurrency);
  }, []);

  async function buy(plan: PassId) {
    setBusy(plan);
    setError("");
    track("checkout_started", { plan, currency, with_email: !!email });
    try {
      await startCheckout(plan, email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open checkout.");
      setBusy(null);
    }
  }

  return (
    <div>
      {/* No currency choice: the server charges in naira inside Nigeria and in dollars elsewhere. */}
      <p className="mb-3 text-center text-xs text-muted">
        {currency === "NGN" ? "Prices in naira for Nigeria." : currency ? "Prices in US dollars." : " "}
      </p>
      <div className="mx-auto mb-4 max-w-sm">
        <label htmlFor="pass-email" className="label text-center">Email for pass recovery (optional)</label>
        <input id="pass-email" type="email" autoComplete="email" maxLength={254} className="ph-mask field text-center" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="mt-1.5 text-center text-xs text-muted">If you clear your browser, this is how we find your pass. Never shown publicly or used for marketing.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["day", "week"] as const).map((id, i) => {
          const p = PASSES[id];
          const best = id === "week";
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}
              whileHover={{ y: -3 }}
              className={`card relative flex flex-col p-5 ${best ? "border-accent" : ""}`}
            >
              {best && <span className="absolute -top-2.5 left-5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">Best value</span>}
              <p className="text-sm font-medium">{p.name}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {currency ? formatPrice(p.price[currency], currency) : <span className="inline-block h-7 w-24 animate-pulse rounded bg-paper align-middle" />}
                <span className="text-sm font-normal text-muted"> / {p.days === 1 ? "day" : "week"}</span>
              </p>
              {!compact && (
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted">
                  {PERKS[id].map((x) => <li key={x}>✓ {x}</li>)}
                </ul>
              )}
              <button className={`mt-4 w-full ${best ? "btn" : "btn-ghost"}`} disabled={!!busy || !currency} onClick={() => buy(id)}>
                {busy === id && <Spinner />}
                {busy === id ? "Opening checkout…" : `Get ${p.name.toLowerCase()}`}
              </button>
            </motion.div>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
      <p className="mt-3 text-center text-xs text-muted">One-time payment via Bachs. No subscription, no sign-up. Cards, bank transfer and more.</p>
    </div>
  );
}
