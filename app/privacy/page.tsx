import AnalyticsToggle from "@/components/AnalyticsToggle";
import DeleteData from "@/components/DeleteData";
import { SUPPORT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Privacy & data — Carreadi" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl py-10 text-[15px] leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy &amp; data</h1>
      <ul className="mt-6 list-disc space-y-3 pl-5 text-muted">
        <li>Your résumé file is read <b className="text-ink">in your browser</b>. The file is never uploaded.</li>
        <li>
          Only after you tick the consent box, the extracted text is sent to <b className="text-ink">Cloudflare Workers AI</b> for one
          analysis. We don&rsquo;t store or log it.
        </li>
        <li>Your résumé text, results and roadmap are saved <b className="text-ink">only in this browser</b>.</li>
        <li>To enforce the free limit, the server keeps salted hashes of your IP with the day and week, plus counters, deleted after 8 days.</li>
        <li>
          Jobs come from employers&rsquo; public job boards (Greenhouse, Lever, Ashby, Workable, Recruitee) and, only if you turn them
          on, remote-job sites (Himalayas, Jobicy, Remote OK, Arbeitnow). Those are credited with a link on each job.
        </li>
        <li>
          If you request a company, we store the company name, link and note you send so we can review it.
        </li>
        <li>
          Passes need no account. If you add an email at checkout, Bachs sends your receipt there and we keep only a scrambled
          fingerprint of it, so we can find your pass if you lose it. If you ask for help with a lost pass, we keep that email
          until we&rsquo;ve replied (and no longer than 60 days).
        </li>
        <li>
          We use <b className="text-ink">PostHog</b> to see how the site is used (pages, clicks, and steps like &ldquo;analysis
          finished&rdquo;). Session replays hide everything you type and your résumé-based results. Your résumé text and file
          name are never sent to analytics.
        </li>
      </ul>
      <p className="mt-6 text-sm text-muted">
        Questions, payment problems or data requests:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-ink underline">{SUPPORT_EMAIL}</a>
      </p>
      <div className="mt-8 space-y-6">
        <AnalyticsToggle />
        <DeleteData />
      </div>
    </div>
  );
}
