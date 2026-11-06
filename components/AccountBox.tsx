"use client";
import { useText, displayValue } from "@/lib/useText";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteAccount, getSession, signOut, syncHistory } from "@/lib/client/account";
import { getPass } from "@/lib/client/pass";
import type { HistoryEntry } from "@/lib/client/store";

/**
 * Where the history lives, and the way to keep it safe: signed in (saved to the account),
 * a pass on this device (sign in to save), or free (this device only, a pass to save it).
 */
export default function AccountBox({ onSynced }: { onSynced: (list: HistoryEntry[]) => void }) {
  const tr = useText();
  const [session, setSession] = useState<string | null>(null);
  const [hasPass, setHasPass] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const refresh = () => setSession(getSession());
    refresh();
    setHasPass(!!getPass()?.token);
    window.addEventListener("carreadi:session", refresh);
    return () => window.removeEventListener("carreadi:session", refresh);
  }, []);

  useEffect(() => {
    if (!session) return;
    setSyncing(true);
    syncHistory()
      .then(onSynced)
      .catch((e) => setError(e instanceof Error ? e.message : tr("Couldn't reach your account.")))
      .finally(() => setSyncing(false));
  }, [session, onSynced]);

  if (session)
    return (
      <div className="mt-4 rounded-xl border border-accent/25 bg-accent-soft/60 px-4 py-3 text-sm">
        <p className="font-medium text-accent">{tr("☁️ {value0}", { value0: displayValue(syncing ? tr("Syncing with your account…") : tr("Saved to your Carreadi account")) })}</p>
        <p className="mt-0.5 text-xs text-muted">{tr("Results and roadmaps only, encrypted. Your CV is never saved.")}</p>
        {error && <p className="mt-1 text-xs text-bad">{tr(error)}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <button className="text-muted underline" onClick={() => void signOut()}>{tr("Sign out")}</button>
          {confirming ? (
            <span className="flex gap-3">
              <span className="text-muted">{tr("Delete everything saved in your account?")}</span>
              <button className="font-medium text-bad underline" onClick={() => void deleteAccount().catch((e) => setError(e.message))}>{tr("Delete")}</button>
              <button className="text-muted underline" onClick={() => setConfirming(false)}>{tr("Keep")}</button>
            </span>
          ) : (
            <button className="text-muted underline hover:text-bad" onClick={() => setConfirming(true)}>{tr("Delete saved checks from my account")}</button>
          )}
        </div>
      </div>
    );

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-sm">
      <p className="text-muted">{tr("🔒 Saved on this device only. Clearing your browser removes it.{value0}", { value0: displayValue(hasPass ? tr(" Sign in to keep it safe on any device.") : tr(" A pass lets you save it to your account.")) })}</p>
      {hasPass ? (
        <Link href="/signin" className="btn">{tr("Sign in to save")}</Link>
      ) : (
        <span className="flex gap-3">
          <Link href="/signin" className="text-xs text-muted underline">{tr("Already paid? Sign in")}</Link>
          <Link href="/plans" className="btn">{tr("See passes")}</Link>
        </span>
      )}
    </div>
  );
}
