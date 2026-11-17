// Free tier: one preview analysis per visitor (salted IP hash) per week, Monday to Monday (UTC).
export const FREE_LIMIT = 1; // per day
export const FREE_WEEKLY_LIMIT = 1;
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

/**
 * A time-limited discount on every pass. It is applied on the server when a checkout is created,
 * so the payment page charges the discounted price. Set to null when no promo is running.
 */
export const PROMO: { percent: number; startsAt: string; endsAt: string } | null = {
  percent: 50,
  startsAt: "2026-11-06T00:00:00+01:00",
  endsAt: "2026-11-07T00:00:00+01:00", // midnight in Lagos
};

export function activePromo(now = Date.now()): { percent: number; endsAt: number } | null {
  if (!PROMO) return null;
  const start = Date.parse(PROMO.startsAt);
  const end = Date.parse(PROMO.endsAt);
  return now >= start && now < end ? { percent: PROMO.percent, endsAt: end } : null;
}

/** A price after a discount, rounded to whole naira or whole cents. */
export function discounted(minor: number, currency: Currency, percent: number) {
  const unit = currency === "NGN" ? 100 : 1;
  return Math.round((minor * (100 - percent)) / 100 / unit) * unit;
}

/**
 * What a pass costs right now. The only price checkout ever uses. A discount code and a running
 * promo never add up: the buyer gets whichever is bigger.
 */
export function priceOf(plan: PassId, currency: Currency, now = Date.now(), codePercent = 0) {
  const base = PASSES[plan].price[currency];
  const percent = Math.max(activePromo(now)?.percent ?? 0, codePercent);
  return percent ? discounted(base, currency, percent) : base;
}

export function formatPrice(minor: number, currency: Currency, locale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100);
}
