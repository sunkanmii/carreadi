import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "carreadi",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    // Custom domain added in the dashboard; listed here so deploys keep it. Listing a domain
    // switches workers.dev off by default, which would break existing links and payment returns.
    domains: ["carreadi.naijabukana.com"],
    workersDev: true,
    previewUrls: true,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Workers AI always runs remotely, so dev needs `cf auth login`. Set CARREADI_OFFLINE=1
      // to run everything else without credentials (analysis then returns a 503).
      ...(process.env.CARREADI_OFFLINE === "1" ? {} : { AI: bindings.ai({ dev: { remote: true } }) }),
      // Daily per-visitor quota counters only. No résumé data is stored.
      DB: bindings.d1({ id: "36ed9169-20d2-4c01-910b-c22c441430ee" /* carreadi-db */ }),
      // Shared job-board cache (public job data only), refreshed hourly.
      JOBS_KV: bindings.kv({ id: "f59e6ba9a45141f4902fb22f48775b8d" }),
      // Required secrets: deploys refuse to run until both exist. Set them in the dashboard as type
      // "Secret" (deploys never overwrite secrets) and in .dev.vars for local dev.
      QUOTA_SALT: bindings.secret(), // salts the visitor hashes for usage limits
      ADMIN_TOKEN: bindings.secret(), // unlocks /admin (company requests); 16+ random characters
      // Optional, not declared so deploys don't require them: POSTHOG_KEY (phc_…) and POSTHOG_HOST,
      // added in the dashboard as type "Secret".
      // Burst limiter for every API route.
      API_LIMITER: bindings.rateLimit({ namespace: "1001", simple: { limit: 30, period: 60 } }),
    },
  }),
});
