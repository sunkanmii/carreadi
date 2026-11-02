// Product analytics via PostHog, only when POSTHOG_KEY is set on the Worker and the visitor
// hasn't opted out on /privacy. Never send résumé text, file names, job text or AI output:
// events carry counts, ids of public jobs and UI choices only.
import type { PostHog } from "posthog-js";

const OPT_OUT_KEY = "carreadi:analytics-off";
type Props = Record<string, string | number | boolean | null | undefined>;

let ph: PostHog | null = null;
let started = false;
const queue: [string, Props | undefined][] = [];

export function analyticsOptedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {}
  if (off) ph?.opt_out_capturing();
  else if (ph) ph.opt_in_capturing();
  else {
    started = false;
    void initAnalytics();
  }
}

export async function initAnalytics() {
  if (started || typeof window === "undefined" || analyticsOptedOut()) return;
  started = true;
  try {
    const cfg = await fetch("/api/config").then((r) => r.json() as Promise<{ posthogKey: string | null; posthogHost: string }>);
    if (!cfg.posthogKey) return; // Analytics off: the PostHog library is never downloaded.
    const { default: posthog } = await import("posthog-js");
    posthog.init(cfg.posthogKey, {
      api_host: cfg.posthogHost,
      person_profiles: "identified_only",
      capture_pageview: false, // sent by <Analytics /> on each client-side navigation
      capture_pageleave: true,
      session_recording: { maskAllInputs: true, maskTextSelector: ".ph-mask" },
    });
    ph = posthog;
    for (const [e, p] of queue.splice(0)) posthog.capture(e, p);
  } catch {
    // Analytics must never break the app.
  }
}

export function track(event: string, props?: Props) {
  if (ph) ph.capture(event, props);
  else if (!analyticsOptedOut() && queue.length < 50) queue.push([event, props]);
}
