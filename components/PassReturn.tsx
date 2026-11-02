"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/client/analytics";
import { canRecheck, daysLeft, getPass, passStatus, type PassStatus } from "@/lib/client/pass";
import { recheckWithPass } from "@/lib/client/recheck";
import { PASSES } from "@/lib/plans";
import { Spinner } from "./Analyzer";

/** Landing page after Bachs checkout: confirms the payment with the server, then unlocks. */
export default function PassReturn() {
  const router = useRouter();
  const [status, setStatus] = useState<PassStatus | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      // Webhooks can take a few seconds; check with Bachs directly while we wait.
      for (let i = 0; i < 20 && !stop; i++) {
        try {
          const s = await passStatus(true);
          setStatus(s);
          if (s.active) {
            track("pass_activated", { plan: s.plan ?? null });
            return;
          }
          if (s.status === "failed" || s.status === "reversed" || !getPass()) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!stop) setGaveUp(true);
    })();
    return () => {
      stop = true;
    };
  }, []);

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await recheckWithPass();
      router.push("/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't run the analysis.");
      setBusy(false);
    }
  }

  if (!getPass())
    return (
      <Box title="This browser doesn't have the pass">
        If you paid on another device or browser, use your restore code on the <Link href="/plans" className="underline">Plans page</Link>.
      </Box>
    );

  if (status?.active && status.plan)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }} className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-xl text-white">
          ✓
        </motion.div>
        <h1 className="mt-4 text-xl font-semibold">Your {PASSES[status.plan].name.toLowerCase()} is active</h1>
        <p className="mt-1 text-sm text-muted">
          {daysLeft(status.expiresAt)} day{daysLeft(status.expiresAt) === 1 ? "" : "s"} · {status.analysesLeft} full analyses
        </p>
        <p className="mt-4 text-xs text-muted">
          Restore code for other devices: <code className="ph-mask rounded bg-paper px-1.5 py-0.5 text-ink select-all">{getPass()?.reference}</code>
        </p>
        {canRecheck() ? (
          <button className="btn mt-6 w-full" disabled={busy} onClick={unlock}>
            {busy && <Spinner />}
            {busy ? "Unlocking your full results…" : "Unlock my full results"}
          </button>
        ) : (
          <Link href="/" className="btn mt-6 w-full">Start an analysis</Link>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      </motion.div>
    );

  if (status?.status === "failed" || status?.status === "reversed")
    return (
      <Box title="Payment not completed">
        Nothing was charged, or the payment was refunded. <Link href="/plans" className="underline">Try again</Link>.
      </Box>
    );

  return (
    <Box title={gaveUp ? "Still confirming your payment" : "Confirming your payment…"}>
      {gaveUp ? (
        <>
          This can take a few minutes with bank transfers. <b>Don&rsquo;t pay again.</b> Refresh this page shortly. Your restore code:{" "}
          <code className="ph-mask rounded bg-paper px-1.5 py-0.5 text-ink select-all">{getPass()?.reference}</code>
        </>
      ) : (
        <span className="inline-flex items-center gap-2"><Spinner /> Checking with the payment provider.</span>
      )}
    </Box>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}
