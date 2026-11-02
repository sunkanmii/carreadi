// Generates tiny résumé fixtures (PDF + DOCX) for manual/browser extraction tests.
import { writeFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";

const lines = [
  "Ada Okafor - Software Engineer",
  "Lagos, Nigeria | ada@example.com",
  "Experience",
  "Backend Engineer, Paystack-like Fintech (2022-2025)",
  "Built REST APIs in Python and FastAPI serving 2M requests per day.",
  "Designed PostgreSQL schemas and wrote SQL reports for the finance team.",
  "Containerized services with Docker and set up CI/CD with GitHub Actions.",
  "Wrote internal documentation for the payments API.",
  "Skills: Python, FastAPI, PostgreSQL, SQL, Docker, Git, Linux",
  "Education: BSc Computer Science, University of Lagos",
];

// --- PDF ---
const esc = (s) => s.replace(/[\()]/g, (c) => "\\" + c);
const stream = "BT /F1 11 Tf 50 780 Td 14 TL " + lines.map((l) => `(${esc(l)}) Tj T*`).join(" ") + " ET";
const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.4\n";
const offsets = [];
objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(new URL("./resume.pdf", import.meta.url), pdf, "latin1");

// --- DOCX ---
const body = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("");
const docx = zipSync({
  "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  "_rels/.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
});
writeFileSync(new URL("./resume.docx", import.meta.url), docx);
console.log("ok");
