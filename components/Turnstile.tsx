"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useText } from "@/lib/useText";

interface TurnstileApi {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let siteKey: Promise<string | null> | null = null;
let script: Promise<void> | null = null;

const getSiteKey = () =>
  (siteKey ??= fetch("/api/config")
    .then((r) => r.json() as Promise<{ turnstileSiteKey?: string | null }>)
    .then((c) => c.turnstileSiteKey ?? null)
    .catch(() => null));

function loadScript() {
  return (script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      script = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  }));
}

/**
 * Bot check for a public form. Call `useTurnstile("feedback")`, put `{widget}` in the form, send
 * `token` with the request, and call `reset()` after each attempt (a token works only once).
 * `ready` is false only while a check is required and not yet solved: use it to hold the submit button.
 * With no site key configured it renders nothing and `ready` is always true.
 */
export function useTurnstile(action: string) {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [token, setToken] = useState("");
  const [round, setRound] = useState(0);
  useEffect(() => void getSiteKey().then(setKey), []);
  const reset = useCallback(() => {
    setToken("");
    setRound((n) => n + 1);
  }, []);
  const widget = key ? <Widget siteKey={key} action={action} round={round} onToken={setToken} /> : null;
  return { widget, token, reset, ready: key === undefined ? false : !key || !!token };
}

function Widget({ siteKey, action, round, onToken }: { siteKey: string; action: string; round: number; onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const tr = useText();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let id = "";
    let gone = false;
    setFailed(false);
    loadScript()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          language: locale,
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, action, locale, round, onToken]);
  return (
    <div>
      <div ref={box} />
      {failed && <p role="alert" className="text-sm text-bad">{tr("Couldn't load the security check. Turn off any blocker for this site and refresh.")}</p>}
    </div>
  );
}
