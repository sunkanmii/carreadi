import { getText } from "@/i18n/server";

import { useText } from "@/lib/useText";
import AnalyticsToggle from "@/components/AnalyticsToggle";
import DeleteData from "@/components/DeleteData";
import { SUPPORT_EMAIL } from "@/lib/contact";

export async function generateMetadata() { const t = await getText(); return { title: t("Privacy & data — Carreadi") }; }

export default function Page() {
  const tr = useText();
  return (
    <div className="mx-auto w-full max-w-xl py-10 text-[15px] leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">{tr("Privacy & data")}</h1>
      <ul className="mt-6 list-disc space-y-3 ps-5 text-muted">
        <li>{tr("Your résumé file is read ")}<b className="text-ink">{tr("in your browser")}</b>{tr(". The file is never uploaded.")}</li>
        <li>
          {tr("Only after you tick the consent box, the extracted text is sent to ")}<b className="text-ink">{tr("our AI provider")}</b> {tr(" for one analysis. We don’t store or log it.")}</li>
        <li>
          {tr("Your résumé text is saved ")}<b className="text-ink">{tr("only in this browser")}</b>{tr(". Your results, roadmap and history of checks are too, unless you sign in.")}</li>
        <li>
          <b className="text-ink">{tr("If you have a pass and sign in")}</b>{tr(", we also keep your checks (results and roadmaps, never your CV text or file) in your account, encrypted, so you can see them on any device. Sign-in uses a one-time link sent by email through our email provider; we keep only a scrambled fingerprint of your email, not the address. You can delete everything saved in your account from the History page at any time. Accounts unused for 12 months are deleted with their checks.")}</li>
        <li>{tr("To enforce the free limit, the server keeps salted hashes of your IP with the day and week, plus counters, deleted after 8 days.")}</li>
        <li>{tr("Jobs come from employers’ public job boards (Greenhouse, Lever, Ashby, Workable, Recruitee) and, only if you turn them on, remote-job sites (Himalayas, Jobicy, Remote OK, Arbeitnow). Those are credited with a link on each job.")}</li>
        <li>{tr("If you request a company, we store the company name, link and note you send so we can review it.")}</li>
        <li>{tr("Passes need no account. If you add an email at checkout, Bachs sends your receipt there and we keep only a scrambled fingerprint of it, so we can find your pass if you lose it. If you ask for help with a lost pass, we keep that email until we’ve replied (and no longer than 60 days).")}</li>
        <li>
          {tr("We use ")}<b className="text-ink">{tr("an analytics tool")}</b> {tr(" to see how the site is used (pages, clicks, and steps like “analysis finished”). Session replays hide everything you type and your résumé-based results. Your résumé text and file name are never sent to analytics.")}</li>
      </ul>
      <p className="mt-6 text-sm text-muted">
        {tr("See also the ")}<a href="/terms" className="underline">{tr("Terms of Service")}</a>{tr(". Questions, payment problems or data requests:")}{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-ink underline">{SUPPORT_EMAIL}</a>
      </p>
      <div className="mt-8 space-y-6">
        <AnalyticsToggle />
        <DeleteData />
      </div>
    </div>
  );
}
