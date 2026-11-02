// Free tier: one preview analysis per visitor (salted IP hash) per week, Monday to Monday (UTC).
export const FREE_LIMIT = 1; // per day
export const FREE_WEEKLY_LIMIT = 1;
/** Gaps named on a free preview; everything else is removed server-side. */
export const FREE_PREVIEW_GAPS = 2;
/** Of those, how many keep their full steps: the free roadmap gets one real task. */
export const FREE_ROADMAP_STEPS = 1;
/** Job matches shown without a pass. */
export const FREE_MATCHES = 3;

export type PassId = "day" | "week";
export type Currency = "NGN" | "USD";

export interface Pass {
  id: PassId;
  name: string;
  days: number;
  /** Full analyses included. Generous on purpose; it only stops abuse. */
  analyses: number;
  /** Prices in minor units (kobo, cents). */
  price: Record<Currency, number>;
}

export const PASSES: Record<PassId, Pass> = {
  day: { id: "day", name: "Day pass", days: 1, analyses: 5, price: { NGN: 200_000, USD: 200 } },
  week: { id: "week", name: "Week pass", days: 7, analyses: 20, price: { NGN: 500_000, USD: 500 } },
};

export function formatPrice(minor: number, currency: Currency) {
  return currency === "NGN" ? `₦${(minor / 100).toLocaleString("en-NG")}` : `$${(minor / 100).toFixed(minor % 100 ? 2 : 0)}`;
}
