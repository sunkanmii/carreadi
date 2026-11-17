// Discount codes: rules shared by the server and the browser. The server decides everything;
// the browser only uses this to tidy what was typed and to show the price it will be charged.
import type { PassId } from "./plans";

export interface DiscountCode {
  code: string;
  /** 1–100. At 100 the pass is free and no payment page is opened. */
  percent: number;
  /** Only valid for this pass; null means any pass. */
  plan: PassId | null;
  /** How many times it can be redeemed; null means no limit. */
  max_uses: number | null;
  used: number;
  expires_at: number | null;
  active: number;
  note: string;
  created_at: number;
}

// No 0/O or 1/I, so a code read off a slide or a flyer can't be mistyped that way.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** "career day-70 " → "CAREERDAY-70". Null when it can't be a code at all. */
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/.test(code) ? code : null;
}

/** A random 8-character code (about a trillion possibilities), with an optional prefix. */
export function randomCode(prefix = "") {
  // 256 is a multiple of 32, so every character is equally likely.
  const body = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHABET[b % 32]).join("");
  return prefix ? `${prefix}-${body}` : body;
}

export type CodeProblem = "unknown" | "ended" | "used_up" | "plan";

/** Why a code can't be used right now, or null when it can. */
export function codeProblem(c: Pick<DiscountCode, "active" | "expires_at" | "max_uses" | "used" | "plan"> | null, plan?: PassId, now = Date.now()): CodeProblem | null {
  if (!c) return "unknown";
  if (!c.active || (c.expires_at != null && c.expires_at <= now)) return "ended";
  if (c.max_uses != null && c.used >= c.max_uses) return "used_up";
  if (plan && c.plan && c.plan !== plan) return "plan";
  return null;
}

export const CODE_MESSAGES: Record<CodeProblem, string> = {
  unknown: "We don't recognise that code. Check it and try again.",
  ended: "That code has ended.",
  used_up: "That code has been used up.",
  plan: "That code is for the other pass.",
};
