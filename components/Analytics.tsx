"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { initAnalytics, track } from "@/lib/client/analytics";

/** Starts analytics once and records a page view on every client-side navigation. */
export default function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    void initAnalytics();
  }, []);
  useEffect(() => {
    track("$pageview", { $current_url: window.location.origin + pathname });
  }, [pathname]);
  return null;
}
