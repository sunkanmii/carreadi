"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import PassBadge from "./PassBadge";

const LINKS = [
  { href: "/results", label: "My roadmap" },
  { href: "/history", label: "History" },
  { href: "/jobs", label: "Jobs" },
];

/** Phones: the pass badge plus a menu button, so the header never overflows. */
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="flex items-center gap-3 sm:hidden">
      <PassBadge activeOnly />
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-full border border-line bg-white text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
            className="absolute inset-x-5 top-[72px] z-30 overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`block border-b border-line px-5 py-4 text-[15px] last:border-0 ${path === l.href ? "font-medium text-ink" : "text-muted"}`}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/plans" className={`block px-5 py-4 text-[15px] ${path === "/plans" ? "font-medium text-ink" : "text-muted"}`}>
              Pricing
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
