"use client";
import { useText } from "@/lib/useText";

import { useEffect, useState } from "react";
import { analyticsOptedOut, setAnalyticsOptOut } from "@/lib/client/analytics";

export default function AnalyticsToggle() {
  const tr = useText();
  const [on, setOn] = useState(true);
  useEffect(() => setOn(!analyticsOptedOut()), []);
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input dir="auto"
        type="checkbox"
        className="size-4 accent-[var(--color-accent)]"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setAnalyticsOptOut(!e.target.checked);
        }}
      />
      {tr("Share anonymous usage analytics with us")}</label>
  );
}
