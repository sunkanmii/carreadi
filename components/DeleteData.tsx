"use client";

import { useState } from "react";
import { clearAll } from "@/lib/client/store";

export default function DeleteData() {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost border-bad/30 text-bad"
      onClick={() => {
        if (!confirm("Delete your résumé, analysis and roadmap from this browser?")) return;
        clearAll();
        setDone(true);
      }}
    >
      {done ? "Deleted ✓" : "Delete my data"}
    </button>
  );
}
