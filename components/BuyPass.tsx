"use client";
import { useText, displayValue } from "@/lib/useText";
import { clientLocale } from "@/lib/client/locale";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/client/analytics";
import { daysLeft, passStatus, startCheckout, visitorPricing, type PassStatus, type Pricing } from "@/lib/client/pass";
import { discounted, formatPrice, PASSES, type Currency, type PassId } from "@/lib/plans";
import { useCountdown } from "./PromoBanner";
import { Spinner } from "./Analyzer";

export default function BuyPass({ compact = false }: { compact?: boolean }) {
  const tr = useText();
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [busy, setBusy] = useState<PassId | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [active, setActive] = useState<PassStatus | null>(null);
  const [promo, setPromo] = useState<Pricing["promo"]>(null);
  const left = useCountdown(promo?.endsAt);
  const onSale = !!promo && !!left && !left.over;
  useEffect(() => {
    visitorPricing().then((p) => {
      setCurrency(p.currency);
      setPromo(p.promo);
    });
    passStatus().then((s) => setActive(s.active ? s : null)).catch(() => {});
  }, []);

  async function buy(plan: PassId) {
    setBusy(plan);
    setError("");
    track("checkout_started", { plan, currency, with_email: !!email });
    try {
      await startCheckout(plan, email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Couldn't open checkout."));
      setBusy(null);
    }
  }

  if (active?.owner) return (
    <div className="rounded-2xl bg-accent-soft p-5 text-center text-sm">
      <p className="font-medium text-accent">{tr("Owner access is active")}</p>
      <p className="mt-1 text-muted">{tr("All premium features are available. No pass or renewal needed.")}</p>
      <Link href="/admin" className="mt-3 inline-block underline">{tr("Open admin tools")}</Link>
    </div>
  );

  // One pass at a time: while one is active there is nothing to buy (the server refuses too).
  if (active?.plan)
    return (
      <div className="rounded-2xl bg-accent-soft p-5 text-center text-sm">
        <p className="font-medium text-accent">{tr("Active pass: {plan} · Days left: {days} · Analyses left: {analyses}", { plan: tr(PASSES[active.plan].name), days: daysLeft(active.expiresAt), analyses: active.analysesLeft ?? 0 })}</p>
        <p className="mt-1 text-muted">{tr("You can buy a new pass when this one ends.")}</p>
      </div>
    );

  return (
    <div>
      {/* No currency choice: the server charges in naira inside Nigeria and in dollars elsewhere. */}
      {onSale && (
        <div className="mx-auto mb-4 max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-white">
          <p className="font-semibold">{tr("🔥 {percent}% off every pass today", { percent: promo!.percent })}</p>
          <p className="mt-0.5 text-xs text-white/70">{tr("Ends in {hours}h {minutes}m. The discount is applied at checkout.", { hours: left!.hours, minutes: left!.minutes })}</p>
        </div>
      )}
      <p className="mb-3 text-center text-xs text-muted">
        {currency === "NGN" ? tr("Prices in naira for Nigeria.") : currency ? tr("Prices in US dollars.") : " "}
      </p>
      <div className="mx-auto mb-4 max-w-sm">
        <label htmlFor="pass-email" className="label text-center">{tr("Email for pass recovery (optional)")}</label>
        <input dir="auto" id="pass-email" type="email" autoComplete="email" maxLength={254} className="ph-mask field text-center" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="mt-1.5 text-center text-xs text-muted">{tr("If you clear your browser, this is how we find your pass. Never shown publicly or used for marketing.")}</p>
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
              {best && <span className="absolute -top-2.5 start-5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">{tr("Best value")}</span>}
              <p className="text-sm font-medium">{tr(p.name)}</p>
              {onSale && currency && (
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <s className="text-muted">{formatPrice(p.price[currency], currency, clientLocale())}</s>
                  <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">{tr("-{percent}%", { percent: promo!.percent })}</span>
                </p>
              )}
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {currency ? (
                  formatPrice(onSale ? discounted(p.price[currency], currency, promo!.percent) : p.price[currency], currency, clientLocale())
                ) : (
                  <span className="inline-block h-7 w-24 animate-pulse rounded bg-paper align-middle" />
                )}
                <span className="text-sm font-normal text-muted">{p.days === 1 ? tr(" / day") : tr(" / week")}</span>
              </p>
              {!compact && (
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted">
                  {[tr("Every gap, with steps and resources"), tr("Your full roadmap"), id === "day" ? tr("{count} full analyses for 24 hours", { count: p.analyses }) : tr("{count} full analyses for 7 days", { count: p.analyses })].map((x) => <li key={x}>✓ {x}</li>)}
                </ul>
              )}
              <button className={`mt-4 w-full ${best ? "btn" : "btn-ghost"}`} disabled={!!busy || !currency} onClick={() => buy(id)}>
                {busy === id && <Spinner />}
                {busy === id ? tr("Opening checkout…") : tr("Get {value0}", { value0: displayValue(tr(p.name)) })}
              </button>
            </motion.div>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{tr(error)}</p>}
      <p className="mt-3 text-center text-xs text-muted">{tr("One-time payment via Bachs. No subscription, no sign-up. Cards, bank transfer and more.")}</p>
      <p className="mt-1 text-center text-xs text-muted">
        {tr("By buying you agree to the ")}<Link href="/terms" className="underline">{tr("Terms")}</Link>{tr(". All sales are final (")}<Link href="/terms#refunds" className="underline">{tr("refund policy")}</Link>).
      </p>
    </div>
  );
}
