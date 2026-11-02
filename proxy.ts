import { NextResponse, type NextRequest } from "next/server";

// Runs before every request: plain http:// is redirected to https://, so a CV is never sent
// unencrypted. 308 keeps the method and body (a POST stays a POST). Local dev is left alone.
export function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol === "http:" && !local) {
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}
