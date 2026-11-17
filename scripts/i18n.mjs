import ts from "typescript-compiler";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const hash = (s) => { let n = 2166136261; for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619); return `m${(n >>> 0).toString(36)}`; };
const walk = (p) => readdirSync(p, { withFileTypes: true }).flatMap((f) => f.isDirectory() ? walk(`${p}/${f.name}`) : /\.tsx?$/.test(f.name) ? [`${p}/${f.name}`] : []);
const english = JSON.parse(readFileSync("messages/en.json", "utf8"));
const record = (source) => { if (!source.trim()) return; const key = hash(source); if (english.ui[key] && english.ui[key] !== source) throw Error("Message hash collision"); english.ui[key] = source; };
for (const path of [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("i18n")]) {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ["tr", "t", "clientText"].includes(node.expression.getText(file)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) record(node.arguments[0].text);
    if (ts.isPropertyAssignment(node) && ["label", "hint", "note"].includes(node.name.getText(file)) && ts.isStringLiteral(node.initializer)) record(node.initializer.text);
    if (path === "lib/recommend.ts" && ts.isStringLiteral(node) && node.text.includes(" ") && /[a-zA-Z]/.test(node.text)) record(node.text);
    if ((path.startsWith("app/api/") || path.startsWith("lib/analysis/")) && ts.isStringLiteral(node) && /[a-zA-Z]/.test(node.text) && node.text.includes(" ") && !/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|https?:)/.test(node.text) && !/[<>{}]/.test(node.text)) record(node.text);
    if (ts.isNewExpression(node) && node.expression.getText(file) === "JobLinkError" && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0])) record(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }; visit(file);
}
for (const [key, value] of Object.entries(english.ui)) if (!value.trim() || /^(?:use client$|Bearer |calc\(|flex |grid |card |size-|bg-|text-|border-|noopener |public, max-age=|analyze: unexpected error$|paths: unexpected error$|Model did not return JSON$|invalid JSON$|model error$|analysis failed:$|coach failed:$|paths failed:$|Mozilla)/.test(value)) delete english.ui[key];
if (process.argv.includes("--extract")) {
  writeFileSync("messages/en.json", JSON.stringify(english, null, 2) + "\n");
  console.log(`${Object.keys(english.ui).length} source messages extracted.`);
} else {
  const source = JSON.parse(readFileSync("messages/en.json", "utf8")).ui;
  let missing = 0;
  for (const locale of ["en", "fr", "es", "ar"]) {
    const catalog = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).ui;
    const keys = Object.keys(english.ui).filter((key) => !catalog[key]);
    console.log(`${locale}: ${keys.length} missing messages`); missing += keys.length;
  }
  if (missing || Object.keys(english.ui).some((key) => !source[key])) process.exitCode = 1;
}
