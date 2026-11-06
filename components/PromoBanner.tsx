"use client";
import { useText } from "@/lib/useText";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { visitorPricing, type Pricing } from "@/lib/client/pass";

/** Hours and minutes until the promo ends, refreshed every 30 seconds. */
export function useCountdown(endsAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - now);
  return { hours: Math.floor(left / 3600_000), minutes: Math.floor((left % 3600_000) / 60_000), over: left === 0 };
}

/** Site-wide strip while a promo runs, linking to the passes. Hidden on the plans page itself. */
export default function PromoBanner() {
  const tr = useText();
  const path = usePathname();
  const [promo, setPromo] = useState<Pricing["promo"]>(null);
  useEffect(() => {
    void visitorPricing().then((p) => setPromo(p.promo));
  }, []);
  const left = useCountdown(promo?.endsAt);
  if (!promo || !left || left.over || path === "/plans") return null;

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-3xl px-5">
      <Link
        href="/plans"
        className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-xl bg-ink px-4 py-2.5 text-center text-sm text-white hover:opacity-95"
      >
        <span className="font-semibold">{tr("🔥 {percent}% off every pass today", { percent: promo.percent })}</span>
        <span className="text-white/70">{tr("Ends in {hours}h {minutes}m", { hours: left.hours, minutes: left.minutes })}</span>
        <span className="font-medium text-[#f2c14e] underline underline-offset-2">{tr("See passes →")}</span>
      </Link>
    </motion.div>
  );
}
