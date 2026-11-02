"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { requestLink, syncHistory, verifyLink } from "@/lib/client/account";
import { getPass } from "@/lib/client/pass";
import { Spinner } from "./Analyzer";

/** Email sign-in for paid users: ask for a link, or finish signing in from one. */
export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"form" | "sending" | "sent" | "verifying" | "done">("form");
  const [error, setError] = useState("");
  const [hasPass, setHasPass] = useState(false);

  useEffect(() => {
    setHasPass(!!getPass()?.token);
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    // Take the one-time token out of the address bar and history straight away.
    window.history.replaceState(null, "", "/signin");
    setState("verifying");
    verifyLink(token)
      .then(() => syncHistory().catch(() => {}))
      .then(() => {
        setState("done");
        setTimeout(() => router.replace("/history"), 900);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't sign you in.");
        setState("form");
      });
  }, [router]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      await requestLink(email.trim());
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the link.");
      setState("form");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md py-12">
      <AnimatePresence mode="wait">
        {state === "verifying" || state === "done" ? (
          <motion.div key="verify" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="text-2xl">{state === "done" ? "✓" : <Spinner />}</p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">{state === "done" ? "You're signed in" : "Signing you in…"}</h1>
            <p className="mt-1 text-sm text-muted">{state === "done" ? "Bringing up your saved checks." : "Getting your saved checks."}</p>
          </motion.div>
        ) : state === "sent" ? (
          <motion.div key="sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="text-3xl">📬</p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">Check your email</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              If <b className="text-ink">{email.trim()}</b> can sign in, a link is on its way. It works once and expires in 15 minutes. Check spam too.
            </p>
            <button className="mt-6 text-sm text-muted underline" onClick={() => setState("form")}>Use a different email</button>
          </motion.div>
        ) : (
          <motion.form key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={send}>
            <h1 className="text-2xl font-semibold tracking-tight">Keep your checks safe</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sign in to save your checks and roadmap to your Carreadi account, so they&rsquo;re there on any device, even after your pass ends. Your CV is never saved.
            </p>
            <label htmlFor="email" className="mt-6 block text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="field mt-1.5"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted">
              {hasPass
                ? "Use any email you like. It will be linked to the pass on this device."
                : "On a new device? Use the email you bought your pass with."}
            </p>
            <button className="btn mt-5 w-full" disabled={state === "sending"}>
              {state === "sending" && <Spinner />}
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error && <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
            {!hasPass && (
              <p className="mt-6 text-center text-sm text-muted">
                No pass yet? <Link href="/plans" className="underline">See passes</Link>. Your checks are still saved on this device.
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
