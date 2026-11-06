# Languages and accessibility

Carreadi supports English (`en`), French (`fr`), Spanish (`es`) and Modern Standard
Arabic (`ar`). `next-intl` formats the committed catalogs in `messages/`.
There is no runtime machine-translation service or per-page translation charge.

## Request and browser behavior

`i18n/request.ts` selects a validated locale for each request. A saved
`carreadi_locale` cookie wins over `Accept-Language`; unsupported languages fall
back to English. The internal `x-carreadi-locale` API header can explicitly select
one of the four supported languages. Language changes refresh the server tree
without changing URLs, payment-return addresses, or clearing unfinished form state.
The preference is browser-specific, not an account setting.

The root document sets `lang` and `dir`. Arabic uses an Arabic font and RTL layout;
spacing and alignment use logical CSS properties. Email addresses, codes and URLs
retain LTR direction, and editable documents use automatic text direction.
Language does not change payment currency or job eligibility.

## Authoring text

In a component, use `const tr = useText()` and `tr("Full source sentence")`.
Use named ICU arguments for variable values and ICU plurals for count-dependent
grammar. Do not concatenate translated nouns with English plural suffixes.
Dynamic labels must also pass through `tr`, with their source labels included in
the catalog. Async server code uses `getText()` or `textFor(locale)`.

Message IDs are stable hashes of the full English source text. The extractor
checks for collisions. The complete English source remains in each call site and
in `messages/en.json`; do not hand-edit hashes.

```
npm run i18n:extract
npm run i18n:check
npm test
npm run typecheck
```

`scripts/translate-catalog.mjs --account <id>` optionally drafts missing static
messages using the existing Workers AI account. It sends only public product copy,
validates interpolation arguments, and writes catalog files. This authoring step
uses AI inference; it is not required to serve translations. Existing translations
are retained. `scripts/review-translations.mjs` applies curated product terminology
and explicit plural forms after drafting.
`scripts/review-errors.mjs` maintains reviewed validation and service messages.

French, Spanish and Arabic catalogs were initially machine-drafted, then checked
for interpolation integrity, terminology and visible UI behavior. They have not
been certified by native-language or legal reviewers. Review material copy changes,
especially consent, payments and refunds, for equivalent meaning before publishing.

## Generated and original content

New AI analyses use the selected language for guidance, but keep evidence quotations,
skill spellings, source names and URLs unchanged. JSON keys and status enums remain
stable English machine values. Each analysis records its language. Existing reports
stay in their original language; changing the interface never silently reruns AI.
Report exports localize labels, preserve source text and support RTL Word/print output.
Original employer postings are not automatically translated.

Roadmap matching uses Unicode-aware keys so different Arabic requirements cannot
collapse into one task. Switching languages for a new analysis may produce different
requirement labels, so progress cannot be assumed to map across translations.

## Accessibility verification

The app includes a skip link, semantic landmarks, visible focus, stronger form and
text contrast, labelled language selection, ARIA tab/radio keyboard navigation,
Escape handling with focus return, and reduced-motion treatment. Email-link sign-in
does not require remembering a password or solving a cognitive puzzle.

Run `npm run dev`, then `npm run test:browser`. The Playwright suite uses an isolated
headless Chrome profile and axe-core, checking the principal pages at 390px and
1280px in all four languages, plus saved reports, roadmap controls and language
persistence. Job APIs are stubbed to avoid dependence on external boards.
Screenshots/traces for failures are ignored by Git. `TEST_BASE_URL` can point at a
local production preview. These checks do not certify WCAG conformance; manual
screen-reader testing remains necessary.

Before adding a language, update `LOCALES`, its display names, the server catalog
loader, direction rules, and the catalog/test matrix. Verify fonts, plurals, mixed
text direction, long labels, email and exports. Keep all locale state request-scoped
on the server; never put the current visitor's locale in a shared module variable.
