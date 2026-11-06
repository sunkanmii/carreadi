import type { KeyboardEvent } from "react";

/** WAI-ARIA horizontal tabs/radio groups: one tab stop, arrows, Home and End. */
export function rovingKeys(event: KeyboardEvent<HTMLElement>, role: "tab" | "radio" = "tab") {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(`[role="${role}"]:not(:disabled)`));
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !items.length) return;
  event.preventDefault();
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const step = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + step + items.length) % items.length;
  items[next].focus();
  items[next].click();
}
