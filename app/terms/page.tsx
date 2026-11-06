import { getText } from "@/i18n/server";

import { useText, displayValue } from "@/lib/useText";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { FREE_WEEKLY_LIMIT, PASSES, formatPrice } from "@/lib/plans";

export async function generateMetadata() { const t = await getText(); return { title: t("Terms of Service — Carreadi") }; }

const UPDATED = "2 November 2026";

export default function Page() {
  const tr = useText();
  const day = PASSES.day;
  const week = PASSES.week;
  return (
    <article className="mx-auto w-full max-w-2xl py-10 text-[15px] leading-relaxed text-ink">
      <h1 className="text-2xl font-semibold tracking-tight">{tr("Terms of Service")}</h1>
      <p className="mt-1 text-sm text-muted">{tr("Last updated {value0}", { value0: displayValue(UPDATED) })}</p>
      <p className="mt-6">{tr("These terms apply when you use Carreadi at carreadi.naijabukana.com (“Carreadi”, “we”, “us”). By using the site or buying a pass, you agree to them. If you don’t agree, please don’t use Carreadi.")}</p>

      <Section title={tr("1. What Carreadi does")}>{tr("Carreadi compares your CV with job postings using AI. It shows requirements your CV already demonstrates, what may be missing, a suggested roadmap, and job listings that may fit you. Job listings come from employers’ public job boards and third-party job sites; they belong to their owners, and we don’t control them or guarantee they are accurate, current or still open.")}</Section>

      <Section title={tr("2. No guarantee of a job")}>{tr("Carreadi gives guidance, not promises. We don’t guarantee interviews, offers, employment or any other outcome. AI output can be incomplete or wrong, and time estimates are rough. Always read the original job posting and use your own judgement before applying or making decisions about your career, education or money.")}</Section>

      <Section title={tr("3. Free use and passes")}>
        <ul className="list-disc space-y-2 ps-5">
          <li>{tr("Free use includes {value0} preview analysis per week per internet connection, with some results and job matches locked.", { value0: displayValue(FREE_WEEKLY_LIMIT) })}</li>
          <li>
            {tr("A ")}<b>{tr("Day pass")}</b> ({formatPrice(day.price.NGN, "NGN")} {tr(" in Nigeria, ")}{formatPrice(day.price.USD, "USD")} {tr(" elsewhere) lasts 24 hours and includes up to ")}{day.analyses} {tr(" full analyses. A ")}<b>{tr("Week pass")}</b> ({formatPrice(week.price.NGN, "NGN")} /{" "}
            {formatPrice(week.price.USD, "USD")}{tr(") lasts 7 days and includes up to ")}{week.analyses} {tr(" full analyses. A pass starts when your payment is confirmed and ends when its time runs out or its analyses are used, whichever comes first. Unused time or analyses don’t carry over.")}</li>
          <li>{tr("Passes are one-time purchases, not subscriptions. You are never charged again automatically.")}</li>
          <li>{tr("A pass is for one person. It lives in the browser you bought it on; you can move it to another device with its restore code, which signs out the previous device. Don’t share or resell passes.")}</li>
          <li>{tr("You can hold one active pass at a time. Prices are shown before you pay and may change for future purchases.")}</li>
        </ul>
      </Section>

      <Section title={tr("4. Payments")}>{tr("Payments are processed by our payment provider, Bachs, on its own secure checkout page. We never see or store your card details. The currency is set by your location: naira in Nigeria, US dollars elsewhere. Your bank or card provider may add its own fees.")}</Section>

      <Section title={tr("5. Refunds: all sales are final")} id="refunds">
        <p>
          {tr("Because a pass gives you instant access to digital results, ")}<b>{tr("all sales are final and we don’t offer refunds")}</b>{tr(", including for passes you don’t use, don’t fully use, or bought by mistake, and for disagreement with AI results.")}</p>
        <p className="mt-3">{tr("We will fix the problem or refund the payment only if:")}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>{tr("you were charged but your pass never activated and we can’t restore it;")}</li>
          <li>{tr("you were charged more than once for the same pass; or")}</li>
          <li>{tr("the law requires a refund.")}</li>
        </ul>
        <p className="mt-3">
          {tr("To ask, email ")}<a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> {tr(" within 7 days of payment with your restore code (it starts with ")}<code>{"carreadi-"}</code>{tr(") or your payment receipt. Please contact us before disputing a charge with your bank; we usually reply within 2 working days. Approved refunds go back to the original payment method.")}</p>
      </Section>

      <Section title={tr("6. Your CV and data")}>
        {tr("You own your CV. When you choose to run an analysis, you let us send its text to our AI provider only to produce your results; we don’t store your CV on our servers. Your results are saved in your own browser and, if you have a pass and choose to sign in, encrypted in your Carreadi account so you can see them on other devices. Saved checks stay available after your pass ends, until you delete them or the account goes unused for 12 months. Only upload a CV that is yours or that you have permission to use. See the ")}<Link className="underline" href="/privacy">{tr("Privacy page")}</Link> {tr(" for details and how to delete your data.")}</Section>

      <Section title={tr("7. Fair use")}>{tr("Don’t misuse Carreadi: no attempts to break, overload, scrape or reverse-engineer the site; no automated or bulk use; no getting around usage limits or payments; no unlawful, harmful or misleading content. We may limit or end access for anyone who does, without a refund.")}</Section>

      <Section title={tr("8. Availability and changes")}>{tr("We work to keep Carreadi running, but it may sometimes be slow, unavailable or changed, and features may be added or removed. If an outage stops you using a pass you paid for, contact us and we’ll extend it where reasonable.")}</Section>

      <Section title={tr("9. Limitation of liability")}>{tr("To the extent the law allows, Carreadi is provided “as is”, and we aren’t liable for indirect or consequential losses, such as lost opportunities, income or time, arising from using the site, its AI results or third-party job listings. Our total liability for any claim is limited to the amount you paid us in the 30 days before it. Nothing here limits rights you have under Nigerian consumer protection law or any other law that can’t be excluded.")}</Section>

      <Section title={tr("10. Changes to these terms")}>{tr("We may update these terms. The date at the top shows the latest version; changes apply from then on and don’t affect a pass you already bought.")}</Section>

      <Section title={tr("11. Law and contact")}>
        {tr("These terms are governed by the laws of the Federal Republic of Nigeria. Questions:")}{" "}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </Section>
    </article>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-20">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-muted [&_b]:text-ink">{children}</div>
    </section>
  );
}
