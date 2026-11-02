"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { passStatus, type PassStatus } from "@/lib/client/pass";
import { recheckWithPass } from "@/lib/client/recheck";
import BuyPass from "./BuyPass";
import { Spinner } from "./Analyzer";

/** Shown on free previews: what's held back, and the way to see it. */
export default function Unlock({ locked, onUnlocked }: { locked: number; onUnlocked: () => void }) {
  const [pass, setPass] = useState<PassStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    passStatus().then(setPass).catch(() => setPass({ active: false }));
  }, []);

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await recheckWithPass();
      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlock right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative mt-4 overflow-hidden rounded-2xl border border-accent/30 bg-white p-5">
      {/* Blurred stand-ins hint at the hidden gaps without containing any of them. */}
      <div aria-hidden className="pointer-events-none mb-4 space-y-2 blur-[3px] select-none">
        {Array.from({ length: Math.min(3, Math.max(1, locked)) }, (_, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <span className="h-3 w-48 rounded bg-line" />
            <span className="h-4 w-16 rounded-full bg-bad-soft" />
          </div>
        ))}
      </div>
      {pass && !pass.active && pass.plan && (
        <p className="mb-2 text-center text-sm text-warn">Your pass has ended or has no analyses left, so this is a free preview.</p>
      )}
      <p className="text-center font-medium">
        🔒 {locked > 0 ? `${locked} more gap${locked === 1 ? "" : "s"} and your full roadmap` : "Your full roadmap"} {locked === 1 ? "is" : "are"} locked
      </p>
      <p className="mt-1 text-center text-sm text-muted">See what’s missing, with steps, deliverables and resources to close each gap.</p>
      <div className="mt-4">
        {pass?.active ? (
          <button className="btn w-full" disabled={busy} onClick={unlock}>
            {busy && <Spinner />}
            {busy ? "Unlocking…" : "Unlock with my pass"}
          </button>
        ) : (
          <BuyPass compact />
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-center text-sm text-bad">{error}</p>}
    </motion.div>
  );
}
