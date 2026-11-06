// One-time/offline catalog drafting. Translates public interface copy, never user documents.
// Uses the existing Workers AI account; no runtime translation service is added to the app.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const account = process.argv[process.argv.indexOf("--account") + 1];
if (!/^[a-f0-9]{32}$/.test(account ?? "")) throw Error("Pass --account <Cloudflare account ID>");
const authFile = join(process.env.APPDATA, "xdg.config/.wrangler/config/default.toml");
const token = process.env.CLOUDFLARE_API_TOKEN || readFileSync(authFile, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
if (!token) throw Error("Log in with Wrangler first");
const english = JSON.parse(readFileSync("messages/en.json", "utf8")).ui;
const placeholders = (s) => [...s.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((m) => m[1]).sort().join(",");
const jobs = [];
for (const [locale, language] of Object.entries({ fr: "French", es: "Spanish", ar: "Modern Standard Arabic" })) {
  const target = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  let batch = {}, size = 0;
  for (const [key, value] of Object.entries(english)) {
    if (!/[a-zA-Z]/.test(value) || value === "carreadi-") { target.ui[key] = value; continue; }
    if (target.ui[key] && placeholders(target.ui[key]) === placeholders(value)) continue;
    if (size > 2400 || Object.keys(batch).length >= 65) { jobs.push({ locale, language, batch }); batch = {}; size = 0; }
    batch[key] = value; size += value.length;
  }
  if (Object.keys(batch).length) jobs.push({ locale, language, batch });
  writeFileSync(`messages/${locale}.json`, JSON.stringify(target, null, 2) + "\n");
}
console.log(`${jobs.length} catalog batches to draft.`);
async function run(job) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messages: [
        { role: "system", content: `You are a professional software translator. Translate all JSON values from English to ${job.language} for Carreadi, a career-readiness website. Return ONLY the JSON object with exactly the same keys. Preserve ALL {value0}, {value1}, {count} and other placeholders EXACTLY, including their braces; never translate placeholder names. Preserve URLs, brand names (Carreadi, Bachs, Cloudflare), codes, digits and technical product names. Use clear, natural, concise UI language. Preserve the exact meaning of privacy, consent, payment and refund terms. Keep leading/trailing spaces where present. For phrases with placeholders that represent plural suffixes, translate the entire phrase naturally while retaining each placeholder. Do not insert commentary, extra keys or HTML. Arabic must be Modern Standard Arabic and directional arrows may be mirrored. Output valid JSON.` },
        { role: "user", content: JSON.stringify(job.batch) },
      ], response_format: { type: "json_schema", json_schema: { type: "object", properties: Object.fromEntries(Object.keys(job.batch).map((key) => [key, { type: "string" }])), required: Object.keys(job.batch), additionalProperties: false } }, max_tokens: 4096, temperature: 0.1 }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw Error(`Workers AI returned ${response.status}: ${JSON.stringify(data.errors ?? []).slice(0, 200)}`);
    let translated = data.result?.response ?? data.result;
    try {
      if (typeof translated === "string") translated = JSON.parse(translated.slice(translated.indexOf("{"), translated.lastIndexOf("}") + 1));
      const current = JSON.parse(readFileSync(`messages/${job.locale}.json`, "utf8"));
      const valid = Object.entries(job.batch).filter(([key, value]) => typeof translated[key] === "string" && translated[key].trim() && placeholders(translated[key]) === placeholders(value));
      for (const [key] of valid) current.ui[key] = translated[key];
      writeFileSync(`messages/${job.locale}.json`, JSON.stringify(current, null, 2) + "\n");
      console.log(`${job.locale}: saved ${valid.length} messages`);
      if (valid.length !== Object.keys(job.batch).length) {
        job.batch = Object.fromEntries(Object.entries(job.batch).filter(([key]) => !valid.some(([k]) => key === k)));
        throw Error(`Retrying ${Object.keys(job.batch).length} messages with missing text or changed placeholders`);
      }
      return;
    } catch (error) { if (attempt === 2) { console.warn(`${job.locale}: needs review: ${Object.keys(job.batch).join(", ")} (${error.message})`); return; } }
  }
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => { while (next < jobs.length) await run(jobs[next++]); }));
console.log("Drafts saved. Review translations before release.");
