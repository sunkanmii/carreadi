import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { FREE_WEEKLY_LIMIT, PASSES, formatPrice } from "@/lib/plans";

export const metadata = { title: "Terms of Service — Carreadi" };

const UPDATED = "2 November 2026";

export default function Page() {
  const day = PASSES.day;
  const week = PASSES.week;
  return (
    <article className="mx-auto w-full max-w-2xl py-10 text-[15px] leading-relaxed text-ink">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-sm text-muted">Last updated {UPDATED}</p>
      <p className="mt-6">
        These terms apply when you use Carreadi at carreadi.naijabukana.com (&ldquo;Carreadi&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By using
        the site or buying a pass, you agree to them. If you don&rsquo;t agree, please don&rsquo;t use Carreadi.
      </p>

      <Section title="1. What Carreadi does">
        Carreadi compares your CV with job postings using AI. It shows requirements your CV already demonstrates, what may be missing,
        a suggested roadmap, and job listings that may fit you. Job listings come from employers&rsquo; public job boards and third-party
        job sites; they belong to their owners, and we don&rsquo;t control them or guarantee they are accurate, current or still open.
      </Section>

      <Section title="2. No guarantee of a job">
        Carreadi gives guidance, not promises. We don&rsquo;t guarantee interviews, offers, employment or any other outcome. AI output can be
        incomplete or wrong, and time estimates are rough. Always read the original job posting and use your own judgement before applying
        or making decisions about your career, education or money.
      </Section>

      <Section title="3. Free use and passes">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Free use includes {FREE_WEEKLY_LIMIT} preview analysis per week per internet connection, with some results and job matches locked.
          </li>
          <li>
            A <b>Day pass</b> ({formatPrice(day.price.NGN, "NGN")} in Nigeria, {formatPrice(day.price.USD, "USD")} elsewhere) lasts 24 hours
            and includes up to {day.analyses} full analyses. A <b>Week pass</b> ({formatPrice(week.price.NGN, "NGN")} /{" "}
            {formatPrice(week.price.USD, "USD")}) lasts 7 days and includes up to {week.analyses} full analyses. A pass starts when your payment
            is confirmed and ends when its time runs out or its analyses are used, whichever comes first. Unused time or analyses don&rsquo;t carry over.
          </li>
          <li>Passes are one-time purchases, not subscriptions. You are never charged again automatically.</li>
          <li>
            A pass is for one person. It lives in the browser you bought it on; you can move it to another device with its restore code,
            which signs out the previous device. Don&rsquo;t share or resell passes.
          </li>
          <li>You can hold one active pass at a time. Prices are shown before you pay and may change for future purchases.</li>
        </ul>
      </Section>

      <Section title="4. Payments">
        Payments are processed by our payment provider, Bachs, on its own secure checkout page. We never see or store your card details.
        The currency is set by your location: naira in Nigeria, US dollars elsewhere. Your bank or card provider may add its own fees.
      </Section>

      <Section title="5. Refunds: all sales are final" id="refunds">
        <p>
          Because a pass gives you instant access to digital results, <b>all sales are final and we don&rsquo;t offer refunds</b>, including
          for passes you don&rsquo;t use, don&rsquo;t fully use, or bought by mistake, and for disagreement with AI results.
        </p>
        <p className="mt-3">We will fix the problem or refund the payment only if:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>you were charged but your pass never activated and we can&rsquo;t restore it;</li>
          <li>you were charged more than once for the same pass; or</li>
          <li>the law requires a refund.</li>
        </ul>
        <p className="mt-3">
          To ask, email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> within 7 days of payment with your
          restore code (it starts with <code>carreadi-</code>) or your payment receipt. Please contact us before disputing a charge with your
          bank; we usually reply within 2 working days. Approved refunds go back to the original payment method.
        </p>
      </Section>

      <Section title="6. Your CV and data">
        You own your CV. When you choose to run an analysis, you let us send its text to our AI provider only to produce your results;
        we don&rsquo;t store your CV on our servers. Your results are saved in your own browser. Only upload a CV that is yours or that you
        have permission to use. See the <Link className="underline" href="/privacy">Privacy page</Link> for details and how to delete your data.
      </Section>

      <Section title="7. Fair use">
        Don&rsquo;t misuse Carreadi: no attempts to break, overload, scrape or reverse-engineer the site; no automated or bulk use; no
        getting around usage limits or payments; no unlawful, harmful or misleading content. We may limit or end access for anyone who
        does, without a refund.
      </Section>

      <Section title="8. Availability and changes">
        We work to keep Carreadi running, but it may sometimes be slow, unavailable or changed, and features may be added or removed.
        If an outage stops you using a pass you paid for, contact us and we&rsquo;ll extend it where reasonable.
      </Section>

      <Section title="9. Limitation of liability">
        To the extent the law allows, Carreadi is provided &ldquo;as is&rdquo;, and we aren&rsquo;t liable for indirect or consequential losses,
        such as lost opportunities, income or time, arising from using the site, its AI results or third-party job listings. Our total
        liability for any claim is limited to the amount you paid us in the 30 days before it. Nothing here limits rights you have under
        Nigerian consumer protection law or any other law that can&rsquo;t be excluded.
      </Section>

      <Section title="10. Changes to these terms">
        We may update these terms. The date at the top shows the latest version; changes apply from then on and don&rsquo;t affect a pass
        you already bought.
      </Section>

      <Section title="11. Law and contact">
        These terms are governed by the laws of the Federal Republic of Nigeria. Questions:{" "}
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
