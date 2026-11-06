"use client";
import { useText, displayValue } from "@/lib/useText";


import Link from "next/link";
import { useEffect, useState } from "react";
import { daysLeft, passStatus, type PassStatus } from "@/lib/client/pass";

/** Header link: the active pass and days left, or a nudge to get one (unless `activeOnly`). */
export default function PassBadge({ activeOnly = false }: { activeOnly?: boolean }) {
  const tr = useText();
  const [s, setS] = useState<PassStatus | null>(null);
  useEffect(() => {
    const load = () => passStatus().then(setS).catch(() => setS({ active: false }));
    void load();
    window.addEventListener("carreadi:pass", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("carreadi:pass", load);
      window.removeEventListener("storage", load);
    };
  }, []);
  if (!s || (activeOnly && !s.active)) return null;
  return s.active ? (
    <Link href={s.owner ? "/admin" : "/plans"} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
      {s.owner ? tr("Owner access") : tr("Pass · {value0}d left", { value0: displayValue(daysLeft(s.expiresAt)) })}
    </Link>
  ) : (
    <Link href="/plans" className="hover:text-ink">{tr("Pricing")}</Link>
  );
}
