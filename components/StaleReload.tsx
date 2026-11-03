"use client";

import { useEffect } from "react";

const KEY = "carreadi:stale-reload";

/**
 * After a deploy, a page opened earlier still asks for the old build's script files, which are
 * gone, so nothing loads. When a script fails to load like that, reload once to get the new build
 * (at most once a minute, so a real outage can't cause a reload loop).
 */
export default function StaleReload() {
  useEffect(() => {
    const reload = () => {
      try {
        const last = Number(sessionStorage.getItem(KEY) ?? 0);
        if (Date.now() - last < 60_000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {}
      window.location.reload();
    };
    const stale = (msg: string) => /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk|error loading dynamically/i.test(msg);
    const onPreload = (e: Event) => {
      e.preventDefault();
      reload();
    };
    const onError = (e: ErrorEvent) => stale(e.message ?? "") && reload();
    const onRejection = (e: PromiseRejectionEvent) => stale(String((e.reason as Error)?.message ?? e.reason ?? "")) && reload();
    // A <script> or <link> for a deleted file fails without an ErrorEvent message: catch it in capture.
    const onResource = (e: Event) => {
      const t = e.target as HTMLScriptElement | HTMLLinkElement | null;
      if (t?.tagName !== "SCRIPT" && !(t?.tagName === "LINK" && (t as HTMLLinkElement).rel.includes("stylesheet"))) return;
      const url = (t as HTMLScriptElement)?.src || (t as HTMLLinkElement)?.href || "";
      if (url.includes("/_next/static/") || url.includes("/assets/")) reload();
    };
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onResource, true);
    return () => {
      window.removeEventListener("vite:preloadError", onPreload);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onResource, true);
    };
  }, []);
  return null;
}
