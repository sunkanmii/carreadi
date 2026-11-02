# Carreadi

AI career-readiness MVP. Upload a résumé, pick a target job, see which requirements your résumé
actually demonstrates, what's missing, and get an editable roadmap plus live jobs worth applying to.

**Stack:** Next.js App Router API on [vinext](https://github.com/cloudflare/vinext) (Vite) · TypeScript ·
Tailwind v4 · Cloudflare Workers · Workers AI · D1 · Workers Rate Limiting.

## Run locally

```bash
npm install
npx cf auth login        # Workers AI only runs remotely, so dev needs your Cloudflare login
npm run dev              # http://localhost:5173
```

No Cloudflare login? Run everything except AI analysis:

```bash
CARREADI_OFFLINE=1 npm run dev     # PowerShell: $env:CARREADI_OFFLINE=1; npm run dev
```

Checks:

```bash
npm test            # 32 unit tests (adapters, schema/evidence validation, roadmap, ranking, path guess)
npm run typecheck
npm run build
```

## Deploy to Cloudflare Workers

```bash
npx wrangler login
npm run deploy        # = vinext-cloudflare deploy: builds, then deploys with Wrangler
```

The database, KV namespace and other bindings are in `wrangler.jsonc`. The `usage` table is created automatically on first use — no migration needed.

**Secrets** (the app needs these). Add each in the dashboard as type *Secret*
(Workers → carreadi → Settings → Variables and Secrets), and in `.dev.vars` for local dev:

| Secret        | What it does                                                        |
| ------------- | ------------------------------------------------------------------- |
| `QUOTA_SALT`  | Long random string; stops usage hashes being reversed back to IPs   |
| `ADMIN_TOKEN` | 16+ random characters; signs you in at `/admin` to review requests |
| `BACHS_API_KEY` | `sk_sandbox_…` or `sk_live_…`, Payments → Write scope only |
| `BACHS_WEBHOOK_SECRET` | Signing secret of the Carreadi webhook in Bachs |
| `BACHS_ORGANIZATION_ID` | Your Bachs account id (`acct_…`) |

Wrangler deploys keep existing secrets. (An earlier `cloudflare.config.ts` setup deleted undeclared ones; it has been replaced.)

For CI, set `CLOUDFLARE_API_TOKEN` (template: "Edit Cloudflare Workers") instead of logging in.

### Deploy from GitHub (recommended)

1. Push this repo to GitHub (private is fine). `.gitignore` keeps out secrets (`.dev.vars`, `*.local.txt`, `.env*`), build output and local tool folders.
2. Cloudflare dashboard → Workers & Pages → **carreadi** → Settings → **Builds** → Connect → pick the repo.
3. Settings: production branch `main` (or `master`), root directory `/`, **build command** `npm test`, **deploy command** `npm run deploy`.
   Cloudflare supplies the API token to the build, and the secrets already set on the Worker are kept.
4. Every push to that branch runs the tests and deploys. Node version comes from `.node-version`.

Custom domains and secrets are managed in the Cloudflare dashboard. Deploys use Wrangler (`wrangler.jsonc`), which leaves them in place.

### Bindings (`wrangler.jsonc`)

| Binding       | What it's for                                                         |
| ------------- | --------------------------------------------------------------------- |
| `AI`          | Workers AI, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (JSON mode) |
| `DB`          | D1: daily free-tier counter (salted IP hash + date + count). Nothing else. |
| `API_LIMITER` | 30 requests / minute / IP on every API route                          |
| `JOBS_KV`     | Shared cache of public job-board data, one key per board, 1-hour TTL  |

### Analytics (PostHog) — optional

Add Worker variables in the Cloudflare dashboard (Workers → carreadi → Settings → Variables and Secrets), no rebuild needed:

| Variable       | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| `POSTHOG_KEY`  | Your PostHog project API key (starts with `phc_`)             |
| `POSTHOG_HOST` | `https://eu.i.posthog.com` for an EU project (default: US)     |

Without a key, the PostHog library is never loaded. Inputs are never recorded; résumé-derived
content (`.ph-mask`) is masked in session replays and excluded from autocapture. Visitors can opt out on /privacy.
Custom events: resume_loaded, analysis_started/succeeded/failed, job_selected, results_tab,
task_completed/reopened/added, resource_opened, application_opened, jobs_searched, job_source_toggled.

### Company requests

Visitors can request a company at `/request`. Links on Greenhouse, Lever, Ashby, Workable or Recruitee
are detected automatically and checked for open roles. Review them at `/admin` (sign in with `ADMIN_TOKEN`):
approving adds the board to D1 (`custom_boards`) and its jobs go live within ~30 minutes, no redeploy.
Other careers pages are reviewed by hand. Requests are limited to 5 per visitor per day.

### Job sources

Company career pages (Greenhouse, Lever, Ashby, Workable, Recruitee) are on by default. Remote-job
aggregators (Himalayas, Jobicy, Remote OK, Arbeitnow) are opt-in per user. Their terms require visible
credit and a link back, shown as "via …" on each job. Remotive is deliberately excluded (4 requests/day
limit and no use alongside signups).

## How it works

```
app/page.tsx            Upload → auto-matched live jobs (or search/paste) → consent → analyze (components/Analyzer.tsx)
app/results             Evidence · Roadmap · Jobs tabs (components/Results.tsx)
app/jobs                Live job search with filters
app/api/analyze         Validates input, enforces quota, calls Workers AI
app/api/jobs[/id]       Normalized jobs from all boards
app/api/recommend       Rule-based job ranking from AI-verified skills
lib/jobs/providers.ts   Greenhouse, Lever (paginated), Ashby adapters
lib/jobs/boards.ts      Seed list of employer boards — edit to add companies
lib/analysis/           Zod schema → JSON Schema for the model, evidence verification
```

**Honesty guards**

- A finding is only "Shown" if its evidence quote is found in your résumé text; otherwise it's downgraded to "Unclear".
- "Demonstrated skills" must literally appear in the résumé.
- Learning links are restricted to an allowlist of known learning sites; anything else becomes a search link.
- Model output is validated with Zod; one retry, then a friendly error.
- No hiring probabilities anywhere. Job tiers list the exact criteria used.
- Remote jobs are only treated as worldwide when the posting says so ("Remote - US" never matches "Germany").
- Jobs mentioning language requirements, clearance, or work-authorization limits are never "apply now".
- Publication dates are shown only when the provider gives one (Greenhouse `first_published`, Ashby `publishedAt`, Lever `createdAt` — labelled "Created").

**Privacy**

- Résumé files are parsed in the browser (pdf.js / DOCX via fflate). Files are never uploaded.
- Text goes to Workers AI only after the consent checkbox. It's never stored or logged server-side.
- Results and roadmap live in the browser's local storage. "Delete my data" on /privacy clears it.
- Outbound fetches are limited to `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com` over HTTPS.
- Job-board HTML is converted to plain text on the server; no third-party HTML is ever rendered.

## Status — what's tested and what isn't

Tested:

- Unit tests (32) for all three adapters, Lever pagination, host allowlist, HTML stripping, schema validation, evidence verification, retry/failure handling, roadmap refresh and job ranking.
- In the browser (local dev): PDF and DOCX upload/extraction, live job picker, live jobs page and filters, job details, consent gating, error state, results/evidence/roadmap UI (complete tasks, next step, local save), recommendations against live jobs, data deletion, mobile layout (375px).
- Live API calls to all 17 seeded sources (no errors on 2026-11-02), including in production.
- Production build and `vinext-cloudflare deploy --dry-run`.

- Real Workers AI analyses (local dev and production, 2026-11-02): valid JSON first try, 30–45 s per analysis,
  evidence quotes verified against the résumé. Deployed at https://carreadi.sunkanmifafowora.workers.dev with
  D1 quota counting confirmed.

**Not yet verified:**

- The rate-limit binding actually returning 429 in production (not load-tested).
- Comparison against other models (e.g. `@cf/openai/gpt-oss-120b`) — Llama is the documented JSON-mode choice, not a benchmarked one.
- Scanned (image-only) PDFs can't be read — users are told to paste text instead.

## Known limitations

- Free tier is 5 analyses per IP per day; one roadmap per browser. No accounts, payments, alerts or scheduled refresh (all P1).
- Jobs are cached per Worker instance (30 min) and in KV (1 h). A cold KV miss parses every board in one request (~5 s); a Cron Trigger refresh would remove that. Check each new board with curl before adding it.
- Job ranking uses a fixed skill list (`lib/careers.ts`); niche skills outside it aren't counted.
- LinkedIn, Indeed, Wellfound and YC are external search links only — no scraping.
