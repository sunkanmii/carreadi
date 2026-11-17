"use client";
import { strToU8, zipSync } from "fflate";
import type { Analysis, Finding } from "../analysis/schema";
import type { Roadmap } from "../roadmap";
import type { Saved } from "./store";
import { clientLocale, clientText } from "./locale";
import { direction, isLocale, type Locale } from "../i18n";

// Exports of full (paid) results: Word, print-to-PDF, calendar and a plain checklist.
// Everything is built in the browser; nothing is sent anywhere.

export interface Report {
  locale?: Locale;
  contentLocale?: Locale;
  title: string;
  date: string;
  summary: string;
  proven: Finding[];
  gaps: Finding[];
  roadmap: Roadmap;
  link?: string;
}

const STATUS: Record<Finding["status"], string> = {
  demonstrated: "Shown",
  not_shown: "Not shown yet",
  missing: "Missing",
  uncertain: "Unclear",
  eligibility: "Eligibility",
};
const IMPORTANCE = { required: "Required", preferred: "Preferred", bonus: "Nice to have" } as const;
const SITE = "carreadi.naijabukana.com";

export function reportOf(s: Saved): Report {
  const a = s.analysis as Analysis;
  return {
    locale: isLocale(clientLocale()) ? clientLocale() as Locale : "en",
    contentLocale: isLocale(a.locale) ? a.locale : "en",
    title: s.job ? `${s.job.title} · ${s.job.company}` : a.roleTitle,
    date: new Date().toLocaleDateString(clientLocale(), { day: "numeric", month: "long", year: "numeric" }),
    summary: a.summary,
    proven: a.findings.filter((f) => f.status === "demonstrated"),
    gaps: a.findings.filter((f) => f.status !== "demonstrated").sort((x, y) => x.priority - y.priority),
    roadmap: s.roadmap as Roadmap,
    link: s.job?.applyUrl,
  };
}

const fileName = (r: Report, ext: string) =>
  `Carreadi - ${r.title.replace(/[^\p{L}\p{N} .,&-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80)}.${ext}`;

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plain-text checklist that pastes cleanly into Notes, OneNote, Notion, Google Keep or WhatsApp. */
export function checklistText(r: Report) {
  const lines = [clientText("Carreadi roadmap: {title}", { title: r.title }), ""];
  for (const t of r.roadmap.tasks) {
    lines.push(`${t.done ? "☑" : "☐"} ${t.title}${t.hours ? ` (~${t.hours} h)` : ""}`);
    if (t.deliverable) lines.push(`   → ${t.deliverable}`);
    if (t.resource?.url) lines.push(`   ${t.resource.name}: ${t.resource.url}`);
  }
  lines.push("", clientText("Made with Carreadi · {site}", { site: SITE }));
  return lines.join("\n");
}

/**
 * Copies text. Some browsers (in-app browsers, locked-down pages) block the clipboard API, so this falls
 * back to the older copy command. Returns false when both are blocked; the caller then shows the text.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    area.remove();
    return ok;
  }
}

export const copyChecklist = (r: Report) => copyText(checklistText(r));

const WHY_STATUS: Record<Finding["status"], string> = {
  demonstrated: "shown in my CV",
  not_shown: "my CV shows related work, not this",
  missing: "not in my CV",
  uncertain: "unclear from my CV",
  eligibility: "possible eligibility limit",
};

/**
 * The essentials as Markdown for pasting into an AI chat: the role, what the CV shows, the gaps and the
 * roadmap with progress. Leaves out the long how-to guides; the AI can expand any step itself.
 */
export function aiText(r: Report) {
  const out = [
    `# Career roadmap: ${r.title}`,
    `Context from Carreadi (${SITE}): a check of my CV against one job, and my roadmap to close the gaps. Use it to help me.`,
    `Date: ${r.date}${r.link ? ` · Job: ${r.link}` : ""}`,
  ];
  if (r.summary) out.push("", "## Summary", r.summary);
  if (r.proven.length) {
    out.push("", "## What my CV already shows");
    for (const f of r.proven) out.push(`- ${f.requirement}${f.evidence ? ` (CV: "${f.evidence}")` : ""}`);
  }
  if (r.gaps.length) {
    out.push("", "## Gaps");
    for (const f of r.gaps) out.push(`- ${f.requirement} [${IMPORTANCE[f.importance].toLowerCase()}; ${WHY_STATUS[f.status]}]`);
  }
  const tasks = r.roadmap.tasks;
  const done = tasks.filter((t) => t.done).length;
  out.push("", `## Roadmap (${done} of ${tasks.length} done${r.roadmap.pace ? `, ${r.roadmap.pace} h/week` : ""})`);
  tasks.forEach((t, i) => {
    out.push(`${i + 1}. [${t.done ? "x" : " "}] ${t.title}${t.hours ? ` (~${t.hours} h)` : ""}`);
    if (t.requirement && t.requirement !== "Custom") out.push(`   - Closes: ${t.requirement}${t.importance ? ` (${IMPORTANCE[t.importance].toLowerCase()})` : ""}`);
    if (t.deliverable) out.push(`   - Deliverable: ${t.deliverable}`);
    if (t.resource?.url) out.push(`   - Resource: ${t.resource.name} ${t.resource.url}`);
    if (t.proof) {
      const verdict = { meets: "meets the requirement", partly: "almost there", not_yet: "not shown yet" }[t.proof.verdict];
      out.push(`   - My work: ${t.proof.links.join(", ")} (checked: ${verdict})`);
      for (const s of t.proof.improve) out.push(`     - To improve: ${s}`);
    }
  });
  return out.join("\n");
}

export const copyForAi = (r: Report) => copyText(aiText(r));

// ---- Word (.docx): a minimal, valid document built by hand and zipped with fflate ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Run = { text: string; bold?: boolean; italic?: boolean; size?: number; color?: string };
const run = (r: Run) =>
  `<w:r><w:rPr>${r.bold ? "<w:b/>" : ""}${r.italic ? "<w:i/>" : ""}${r.color ? `<w:color w:val="${r.color}"/>` : ""}<w:sz w:val="${(r.size ?? 11) * 2}"/></w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
const para = (runs: Run[], opts: { before?: number; after?: number; indent?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${(opts.before ?? 0) * 20}" w:after="${(opts.after ?? 6) * 20}"/>${opts.indent ? `<w:ind w:left="${opts.indent * 20}"/>` : ""}</w:pPr>${runs.map(run).join("")}</w:p>`;
const heading = (text: string) => para([{ text, bold: true, size: 15, color: "1F5F4A" }], { before: 14, after: 6 });

export function docxBytes(r: Report): Uint8Array {
  const t = clientText;
  const body: string[] = [
    para([{ text: t("Carreadi · Career readiness report"), size: 9, color: "6B6F78" }]),
    para([{ text: r.title, bold: true, size: 20 }], { after: 2 }),
    para([{ text: r.date, size: 10, color: "6B6F78" }], { after: 10 }),
  ];
  if (r.summary) body.push(para([{ text: r.summary }]));

  body.push(heading(t("Your roadmap")));
  for (const t of r.roadmap.tasks) {
    body.push(para([{ text: `${t.done ? "☑" : "☐"}  `, size: 12 }, { text: t.title, bold: true }, ...(t.hours ? [{ text: `   ~${t.hours} h`, color: "6B6F78" }] : [])], { before: 6, after: 2 }));
    if (t.deliverable) body.push(para([{ text: clientText("Deliverable: "), color: "6B6F78" }, { text: t.deliverable }], { indent: 22, after: 2 }));
    if (t.requirement) body.push(para([{ text: "Closes: ", color: "6B6F78" }, { text: t.requirement }], { indent: 22, after: 2 }));
    if (t.resource?.url) body.push(para([{ text: "Learn: ", color: "6B6F78" }, { text: `${t.resource.name} · ${t.resource.url}`, color: "1F5F4A" }], { indent: 22 }));
  }

  body.push(heading(t("What your CV already proves")));
  if (!r.proven.length) body.push(para([{ text: "Nothing clearly shown yet.", color: "6B6F78" }]));
  for (const f of r.proven) {
    body.push(para([{ text: "✓  ", color: "1F5F4A", bold: true }, { text: f.requirement, bold: true }], { before: 4, after: 2 }));
    if (f.evidence) body.push(para([{ text: `“${f.evidence}”`, italic: true, color: "444444" }], { indent: 22 }));
  }

  body.push(heading(t("What's missing")));
  if (!r.gaps.length) body.push(para([{ text: "No gaps found.", color: "6B6F78" }]));
  for (const f of r.gaps) {
    body.push(para([{ text: f.requirement, bold: true }, { text: `   ${t(STATUS[f.status])} · ${t(IMPORTANCE[f.importance])}`, color: f.status === "missing" || f.status === "eligibility" ? "A33A2B" : "8A6D1F" }], { before: 4 }));
  }

  if (r.link) body.push(para([{ text: t("Apply: "), color: "6B6F78" }, { text: r.link, color: "1F5F4A" }], { before: 12 }));
  body.push(para([{ text: t("Made with Carreadi · {site}. AI output, checked against your CV text. Not a prediction of hiring outcomes.", { site: SITE }), size: 8, color: "6B6F78" }], { before: 18 }));

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(r.locale === "ar" ? document.replace(/<w:pPr>/g, '<w:pPr><w:bidi/><w:jc w:val="right"/>').replace(/<w:rPr>/g, '<w:rPr><w:lang w:val="ar" w:bidi="ar"/>') : document),
  });
}

export function downloadDocx(r: Report) {
  download(fileName(r, "docx"), docxBytes(r) as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

// ---- PDF: a clean report in a new window, printed with the browser's "Save as PDF" ----

export function printReport(r: Report) {
  const h = (s: string) => esc(s);
  const t = (source: string) => h(clientText(source));
  const task = (t: Roadmap["tasks"][number]) => `
    <li class="${t.done ? "done" : ""}"><span class="box">${t.done ? "✓" : ""}</span><div>
      <b>${h(t.title)}</b>${t.hours ? ` <span class="m">~${t.hours} h</span>` : ""}
      ${t.deliverable ? `<div class="m">${h(clientText("Deliverable: "))}<span class="ink" dir="auto">${h(t.deliverable)}</span></div>` : ""}
      ${t.resource?.url ? `<div class="m">${h(clientText("Learn: "))}<a href="${h(t.resource.url)}">${h(t.resource.name)}</a></div>` : ""}
    </div></li>`;
  const html = `<!doctype html><html lang="${isLocale(r.locale) ? r.locale : "en"}" dir="${direction(r.locale ?? "en")}"><head><meta charset="utf-8"><title>${h(fileName(r, "pdf").replace(/\.pdf$/, ""))}</title><style>
    @page{margin:18mm} *{box-sizing:border-box} body{font:11pt/1.5 Inter,system-ui,sans-serif;color:#16181d;margin:0 auto;max-width:720px;padding:24px}
    .k{font-size:9pt;color:#6b6f78;letter-spacing:.04em;text-transform:uppercase} h1{font-size:20pt;margin:4px 0 2px;letter-spacing:-.02em}
    h2{font-size:13pt;color:#1f5f4a;margin:22px 0 8px;border-bottom:1px solid #e7e5e1;padding-bottom:4px} .m{color:#6b6f78;font-size:10pt} .ink{color:#16181d}
    ul{list-style:none;padding:0;margin:0} li{display:flex;gap:10px;padding:7px 0;break-inside:avoid} .box{flex:none;width:16px;height:16px;border:1.5px solid #1f5f4a;border-radius:4px;font-size:11px;line-height:13px;text-align:center;color:#fff;margin-top:3px}
    li.done .box{background:#1f5f4a} li.done b{text-decoration:line-through;color:#6b6f78} q{font-style:italic;color:#444} a{color:#1f5f4a}
    .tag{font-size:9pt;padding:1px 8px;border-radius:99px;background:#fbe9e6;color:#a33a2b;margin-left:6px} .foot{margin-top:28px;font-size:8.5pt;color:#6b6f78}
  </style></head><body>
    <div class="k">${t("Carreadi · Career readiness report")}</div><h1 dir="auto">${h(r.title)}</h1><div class="m">${h(r.date)}</div>
    ${r.summary ? `<p lang="${isLocale(r.contentLocale) ? r.contentLocale : "en"}" dir="auto">${h(r.summary)}</p>` : ""}
    <h2>${t("Your roadmap")}</h2><ul>${r.roadmap.tasks.map(task).join("")}</ul>
    <h2>${t("What your CV already proves")}</h2><ul>${r.proven.map((f) => `<li><span class="box" style="background:#1f5f4a">✓</span><div><b dir="auto">${h(f.requirement)}</b>${f.evidence ? `<div><q dir="auto">${h(f.evidence)}</q></div>` : ""}</div></li>`).join("") || `<li class="m">${t("Nothing clearly shown yet.")}</li>`}</ul>
    <h2>${t("What's missing")}</h2><ul>${r.gaps.map((f) => `<li><div><b dir="auto">${h(f.requirement)}</b><span class="tag">${t(STATUS[f.status])}</span> <span class="m">${t(IMPORTANCE[f.importance])}</span></div></li>`).join("") || `<li class="m">${t("No gaps found.")}</li>`}</ul>
    ${r.link ? `<p class="m">${t("Apply: ")}<a dir="ltr" href="${h(r.link)}">${h(r.link)}</a></p>` : ""}
    <p class="foot">${h(clientText("Made with Carreadi · {site}. AI output, checked against your CV text. Not a prediction of hiring outcomes.", { site: SITE }))}</p>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

// ---- Calendar (.ics): each open step gets a block on the calendar, spaced by the user's pace ----

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

export function calendarText(r: Report, now = new Date()) {
  const pace = r.roadmap.pace ?? 10;
  // Start tomorrow at 19:00 local time; each step is due after its hours at the chosen pace.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 19, 0, 0);
  let dayOffset = 0;
  const events = r.roadmap.tasks
    .filter((t) => !t.done)
    .map((t, i) => {
      const hours = t.hours ?? 5;
      const due = new Date(start);
      dayOffset += Math.max(1, Math.round((hours / pace) * 7));
      due.setDate(start.getDate() + dayOffset);
      const end = new Date(due.getTime() + 60 * 60 * 1000);
      const desc = [t.deliverable && `${clientText("Deliverable: ")}${t.deliverable}`, t.resource?.url && `${clientText("Learn: ")}${t.resource.name} ${t.resource.url}`, clientText("Roadmap for {title}", { title: r.title })].filter(Boolean).join("\n");
      return [
        "BEGIN:VEVENT",
        `UID:${icsDate(now)}-${i}@carreadi`,
        `DTSTAMP:${icsDate(now)}`,
        `DTSTART:${icsDate(due)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${icsEscape(`Carreadi: ${t.title}`)}`,
        `DESCRIPTION:${icsEscape(desc)}`,
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape(clientText("Due tomorrow: {title}", { title: t.title }))}`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Carreadi//Roadmap//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
}

export function downloadIcs(r: Report) {
  download(fileName(r, "ics"), calendarText(r), "text/calendar");
}

// ---- CV with checked projects added (.docx) ----

export interface CvProject { name: string; line: string; bullets: string[]; link: string }
export type CvBlock = { kind: "name" | "heading" | "text" | "bullet" | "project" | "gap"; text: string; added?: boolean };

const PROJECTS_HEADING = /^(?:personal |side |selected |key |academic )?projects?\s*:?$/i;
const LATER_HEADING = /^(?:education|certifications?|licen[cs]es|awards|languages|references|interests|hobbies)\s*:?$/i;
const isHeading = (l: string) => PROJECTS_HEADING.test(l) || LATER_HEADING.test(l) || (/^[\p{Lu}\d &/,'-]{3,40}$/u.test(l) && /\p{Lu}{3}/u.test(l));

/**
 * The CV as blocks, with the projects placed where a reader expects them: at the top of an existing
 * Projects section, or in a new one before Education, or at the end. The CV's own text is never changed.
 */
export function cvBlocks(resume: string, projects: CvProject[]): CvBlock[] {
  const lines = resume.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const firstText = lines.findIndex(Boolean);
  const blocks: CvBlock[] = lines.map((l, i) =>
    !l ? { kind: "gap", text: "" } : i === firstText ? { kind: "name", text: l } : /^[•\-*–▪●]\s+/.test(l) ? { kind: "bullet", text: l.replace(/^[•\-*–▪●]\s+/, "") } : isHeading(l) ? { kind: "heading", text: l } : { kind: "text", text: l },
  );
  const added: CvBlock[] = projects.flatMap((p) => [
    { kind: "project", text: `${p.name}${p.link ? ` | ${p.link}` : ""}`, added: true },
    ...(p.line ? [{ kind: "text", text: p.line, added: true } as CvBlock] : []),
    ...p.bullets.map((b) => ({ kind: "bullet", text: b, added: true }) as CvBlock),
  ]);
  const existing = blocks.findIndex((b) => b.kind === "heading" && PROJECTS_HEADING.test(b.text));
  if (existing >= 0) return [...blocks.slice(0, existing + 1), ...added, ...blocks.slice(existing + 1)];
  const section: CvBlock[] = [{ kind: "heading", text: "PROJECTS", added: true }, ...added, { kind: "gap", text: "" }];
  const later = blocks.findIndex((b) => b.kind === "heading" && LATER_HEADING.test(b.text));
  return later >= 0 ? [...blocks.slice(0, later), ...section, ...blocks.slice(later)] : [...blocks, { kind: "gap", text: "" }, ...section];
}

function docxPackage(bodyXml: string): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(document),
  });
}

export function cvDocxBytes(resume: string, projects: CvProject[]): Uint8Array {
  const body = cvBlocks(resume, projects).map((b) => {
    switch (b.kind) {
      case "name": return para([{ text: b.text, bold: true, size: 18 }], { after: 4 });
      case "heading": return para([{ text: b.text.toUpperCase(), bold: true, size: 12, color: "1F5F4A" }], { before: 10, after: 4 });
      case "project": return para([{ text: b.text, bold: true }], { before: 6, after: 2 });
      case "bullet": return para([{ text: `•  ${b.text}` }], { indent: 18, after: 2 });
      case "gap": return "";
      default: return para([{ text: b.text }], { after: 3 });
    }
  });
  return docxPackage(body.join(""));
}

export function downloadCv(resume: string, projects: CvProject[]) {
  download("CV - with projects.docx", cvDocxBytes(resume, projects) as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
