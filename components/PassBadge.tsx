"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { daysLeft, passStatus, type PassStatus } from "@/lib/client/pass";

/** Header link: the active pass and days left, or a nudge to get one (unless `activeOnly`). */
export default function PassBadge({ activeOnly = false }: { activeOnly?: boolean }) {
  const [s, setS] = useState<PassStatus | null>(null);
  useEffect(() => {
    const load = () => passStatus().then(setS).catch(() => setS({ active: false }));
    void load();
    window.addEventListener("carreadi:pass", load);
    return () => window.removeEventListener("carreadi:pass", load);
  }, []);
  if (!s || (activeOnly && !s.active)) return null;
  return s.active ? (
    <Link href="/plans" className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
      Pass · {daysLeft(s.expiresAt)}d left
    </Link>
  ) : (
    <Link href="/plans" className="hover:text-ink">Pricing</Link>
  );
}
