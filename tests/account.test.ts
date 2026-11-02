import { describe, expect, it } from "vitest";
import { accountsEnabled, validAuthToken, validEmail } from "@/lib/server/account";

describe("sign-in input checks", () => {
  it("accepts real-looking emails and rejects junk or header tricks", () => {
    expect(validEmail("ada@example.com")).toBe(true);
    expect(validEmail("  Ada.Lovelace+jobs@mail.co.uk ")).toBe(true);
    for (const bad of ["", "ada", "ada@", "@example.com", "ada@example", "a b@example.com", "ada@example.com\r\nBcc: x@y.com", "<ada@example.com>", "x".repeat(250) + "@a.com"])
      expect(validEmail(bad)).toBe(false);
  });
  it("only accepts tokens in our own format", () => {
    expect(validAuthToken("a".repeat(43))).toBe(true);
    expect(validAuthToken("short")).toBe(false);
    expect(validAuthToken("a".repeat(42) + "/")).toBe(false);
  });
  it("stays off until the email key and data key are set", () => {
    expect(accountsEnabled()).toBe(false);
  });
});
