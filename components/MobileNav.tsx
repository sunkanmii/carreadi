"use client";
import { useText } from "@/lib/useText";


import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, useId } from "react";
import PassBadge from "./PassBadge";

const LINKS = [
  { href: "/results", label: "My roadmap" },
  { href: "/history", label: "History" },
  { href: "/jobs", label: "Jobs" },
];

/** Phones: the pass badge plus a menu button, so the header never overflows. */
export default function MobileNav() {
  const tr = useText();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [open]);

  return (
    <div ref={ref} className="flex items-center gap-2 md:hidden">
      <button
        ref={button}
        aria-controls={menuId}
        aria-label={open ? tr("Close menu") : tr("Open menu")}
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
            id={menuId}
            aria-label={tr("Main navigation")}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
            className="absolute inset-x-5 top-[72px] z-30 overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
          >
            <div className="px-5 pt-3"><PassBadge activeOnly /></div>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={path === l.href ? "page" : undefined}
                className={`block border-b border-line px-5 py-4 text-[15px] last:border-0 ${path === l.href ? "font-medium text-ink" : "text-muted"}`}
              >
                {tr(l.label)}
              </Link>
            ))}
            <Link href="/plans" className={`block px-5 py-4 text-[15px] ${path === "/plans" ? "font-medium text-ink" : "text-muted"}`}>{tr("Pricing")}</Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
