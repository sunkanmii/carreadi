"use client";
import { useText, displayValue } from "@/lib/useText";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { track } from "@/lib/client/analytics";
import { getPass } from "@/lib/client/pass";
import { clearAll, load } from "@/lib/client/store";

/**
 * Deletes the résumé, results, roadmap and preferences saved in this browser.
 * Confirms on the page itself: window.confirm() is blocked in many in-app and embedded
 * browsers, where it silently returns false. A paid pass is kept on purpose.
 */
export default function DeleteData() {
  const tr = useText();
  const [stage, setStage] = useState<"idle" | "confirm" | "done">("idle");
  const [hasData, setHasData] = useState(false);
  const [passRef, setPassRef] = useState<string | null>(null);

  useEffect(() => {
    setHasData(Object.keys(load()).length > 0);
    setPassRef(getPass()?.reference ?? null);
  }, [stage]);

  function del() {
    clearAll();
    track("data_deleted");
    setStage("done");
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {stage === "confirm" ? (
          <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm">
            <p className="font-medium text-bad">{tr("Delete your résumé, results and roadmap from this browser?")}</p>
            <p className="mt-1 text-muted">{tr("This can’t be undone.{value0}", { value0: displayValue(passRef ? tr(" Your pass is kept.") : "") })}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn bg-bad hover:bg-bad/90" onClick={del}>{tr("Yes, delete")}</button>
              <button className="btn-ghost" onClick={() => setStage("idle")}>{tr("Cancel")}</button>
            </div>
          </motion.div>
        ) : stage === "done" ? (
          <motion.p key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status" className="rounded-2xl bg-accent-soft p-4 text-sm text-accent">
            {tr("✓ Deleted. Your résumé, results and roadmap are gone from this browser.")}{passRef && (
              <>
                {" "}{tr("Your pass is still active here. Its restore code: ")}<code className="ph-mask rounded bg-white px-1.5 py-0.5 text-ink select-all">{passRef}</code>
              </>
            )}
          </motion.p>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button className="btn-ghost border-bad/30 text-bad" onClick={() => setStage("confirm")} disabled={!hasData}>{tr("Delete my data")}</button>
            {!hasData && <p className="mt-2 text-xs text-muted">{tr("Nothing is saved in this browser.")}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
