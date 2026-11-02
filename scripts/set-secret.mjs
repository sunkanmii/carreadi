// Sets a Worker secret through the Cloudflare API, using your `npx cf auth login` session.
//   npm.cmd run secret -- BACHS_API_KEY
// Use this instead of the dashboard: a dashboard edit marks the Worker "last changed from the
// dashboard", and the deploy tool then refuses to deploy (custom-domain details can't match).
// The value is typed hidden and goes straight to Cloudflare; it is never printed or saved.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const ACCOUNT = "bb8481a2a401c26939455a1642820d67";
const WORKER = "carreadi";
const name = process.argv[2];
if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(name ?? "")) {
  console.error("Usage: npm.cmd run secret -- SECRET_NAME   (e.g. BACHS_API_KEY)");
  process.exit(1);
}

let token;
try {
  token = JSON.parse(readFileSync(`${process.env.APPDATA ?? process.env.HOME + "/.config"}/xdg.config/cloudflare/config/default.json`, "utf8")).oauth_token;
} catch {}
if (!token) {
  console.error("Not logged in. Run: npx cf auth login");
  process.exit(1);
}

// Hidden input: echo nothing while the value is typed or pasted.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => {
  if (s.startsWith("Value for")) process.stdout.write(s);
};
const value = await new Promise((r) => rl.question(`Value for ${name} (hidden, paste then Enter): `, r));
rl.close();
process.stdout.write("\n");
if (!value.trim()) {
  console.error("Empty value, nothing changed.");
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers`;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const res = await fetch(`${base}/scripts/${WORKER}/secrets`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ name, text: value.trim(), type: "secret_text" }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.success) {
  console.error(`Failed (${res.status}):`, JSON.stringify(body.errors ?? body).slice(0, 300));
  console.error("If it says authentication, run: npx cf auth login");
  process.exit(1);
}
const svc = await (await fetch(`${base}/services/${WORKER}`, { headers })).json().catch(() => ({}));
console.log(`✓ ${name} saved. Worker last changed from: ${svc.result?.default_environment?.script?.last_deployed_from ?? "?"}`);
