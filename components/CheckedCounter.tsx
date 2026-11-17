"use client";
import { clientLocale } from "@/lib/client/locale";

import { useText } from "@/lib/useText";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

/** Shown only once the real count is big enough to mean something; small numbers would hurt trust. */
const SHOW_FROM = 100;

export default function CheckedCounter() {
  const tr = useText();
  const [n, setN] = useState(0);
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json() as Promise<{ cvsChecked?: number }>)
      .then((d) => setN(d.cvsChecked ?? 0))
      .catch(() => {});
  }, []);
  if (n < SHOW_FROM) return null;
  return (
    <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-sm text-muted">
      <span className="font-semibold text-ink">{n.toLocaleString(clientLocale())}</span> {tr(" CVs checked so far")}</motion.p>
  );
}
