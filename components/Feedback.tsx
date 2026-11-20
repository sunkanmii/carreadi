"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { track } from "@/lib/client/analytics";
import { useText } from "@/lib/useText";
import { useTurnstile } from "./Turnstile";

type Kind = "idea" | "bug" | "praise" | "other";
const KINDS: Kind[] = ["idea", "bug", "praise", "other"];

/**
 * A "Feedback" button in the footer that opens a small dialog: a 1–5 rating, what it's about,
 * a message and an optional email. Sends only what the person types here, never résumé or job text.
 */
export default function Feedback() {
  const tr = useText();
  const locale = useLocale();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("idea");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const human = useTurnstile("feedback");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const labels: Record<Kind, string> = {
    idea: tr("An idea"),
    bug: tr("Something's broken"),
    praise: tr("Something I like"),
    other: tr("Something else"),
  };

  function show() {
    setState("idle");
    setError("");
    human.reset();
    setOpen(true);
    dialog.current?.showModal();
  }
  function hide() {
    dialog.current?.close();
  }
  // <dialog> handles Escape and focus trapping; keep state and focus in step when it closes.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => {
      setOpen(false);
      opener.current?.focus();
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!rating && message.trim().length < 3) return setError(tr("Add a rating or a few words."));
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, rating: rating || undefined, message, email, page: path, locale, turnstile: human.token }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed");
      track("feedback_sent", { kind, rating: rating || null, page: path });
      setState("sent");
      setMessage("");
      setRating(0);
    } catch (err) {
      setState("idle");
      setError(err instanceof Error && err.message !== "Failed" ? tr(err.message) : tr("Couldn't send that right now. Try again shortly."));
    } finally {
      human.reset();
    }
  }

  return (
    <>
      <button ref={opener} type="button" className="hover:text-ink" aria-haspopup="dialog" aria-expanded={open} onClick={show}>
        {tr("Feedback")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="feedback-title"
        className="card m-auto w-[min(92vw,26rem)] p-5 text-ink backdrop:bg-black/40"
        onClick={(e) => e.target === dialog.current && hide()}
      >
        {state === "sent" ? (
          <div className="space-y-4 text-center">
            <h2 id="feedback-title" className="text-base font-semibold">{tr("Thank you!")}</h2>
            <p className="text-sm text-muted">{tr("We read every message, and it shapes what we build next.")}</p>
            <button type="button" className="btn" onClick={hide}>{tr("Close")}</button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4" noValidate>
            <div className="flex items-start justify-between gap-3">
              <h2 id="feedback-title" className="text-base font-semibold">{tr("Tell us what you think")}</h2>
              <button type="button" className="text-sm text-muted underline" onClick={hide}>{tr("Close")}</button>
            </div>

            <fieldset>
              <legend className="label">{tr("How is Carreadi working for you?")}</legend>
              <div className="flex gap-1" role="radiogroup" aria-label={tr("Rating")}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={tr("{value0} out of 5", { value0: n })}
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className={`size-11 rounded-full border text-lg transition ${rating >= n ? "border-accent bg-accent-soft text-accent" : "border-line bg-white text-muted"}`}
                  >
                    {rating >= n ? "★" : "☆"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="label">{tr("This is…")}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-full border px-3.5 py-2 text-sm ${kind === k ? "border-accent bg-accent-soft text-accent" : "border-line bg-white"}`}
                  >
                    {labels[k]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label className="label" htmlFor="fb-message">{tr("Your message")}</label>
              <textarea
                dir="auto"
                id="fb-message"
                className="field min-h-24"
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={tr("What worked, what didn't, what's missing?")}
              />
              <p className="mt-1 text-xs text-muted">{tr("Please don't paste your résumé or personal details here.")}</p>
            </div>

            <div>
              <label className="label" htmlFor="fb-email">{tr("Email (optional, only if you'd like a reply)")}</label>
              <input id="fb-email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            {/* Only drawn while the dialog is open, so the check doesn't load on every page. */}
            {open && human.widget}
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <button className="btn w-full" disabled={state === "sending" || !human.ready}>{state === "sending" ? tr("Sending…") : tr("Send feedback")}</button>
          </form>
        )}
      </dialog>
    </>
  );
}
