import type { Analysis, Finding, ModelOutput } from "./schema";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim();

/** Evidence counts only if it is (close to) a verbatim quote from the résumé. */
export function quoteInResume(quote: string, resumeNorm: string): boolean {
  const q = norm(quote);
  if (q.length < 3) return false;
  if (resumeNorm.includes(q)) return true;
  // Tolerate ellipses / small edits: every 4-word window of the quote must appear.
  const words = q.split(" ");
  if (words.length < 6) return false;
  let hits = 0;
  let windows = 0;
  for (let i = 0; i + 4 <= words.length; i += 2) {
    windows++;
    if (resumeNorm.includes(words.slice(i, i + 4).join(" "))) hits++;
  }
  return hits / windows >= 0.8;
}

const LEARNING_HOSTS = [
  "developer.mozilla.org", "docs.python.org", "freecodecamp.org", "www.freecodecamp.org", "coursera.org",
  "www.coursera.org", "edx.org", "www.edx.org", "khanacademy.org", "www.khanacademy.org", "learn.microsoft.com",
  "cloud.google.com", "docs.aws.amazon.com", "aws.amazon.com", "developers.cloudflare.com", "roadmap.sh",
  "www.kaggle.com", "kaggle.com", "github.com", "docs.github.com", "swagger.io", "spec.openapis.org",
  "react.dev", "nextjs.org", "www.typescriptlang.org", "nodejs.org", "kubernetes.io", "docs.docker.com",
  "developer.hashicorp.com", "www.postgresql.org", "pytorch.org", "www.tensorflow.org", "scikit-learn.org",
  "huggingface.co", "www.w3.org", "web.dev", "www.figma.com", "help.figma.com", "owasp.org", "cheatsheetseries.owasp.org",
  "www.theodinproject.com", "fullstackopen.com", "cs50.harvard.edu", "ocw.mit.edu", "missing.csail.mit.edu",
  "www.atlassian.com", "www.productplan.com", "www.nngroup.com", "developers.google.com", "docs.oracle.com",
  "go.dev", "doc.rust-lang.org", "www.rust-lang.org", "docs.getdbt.com", "spark.apache.org", "airflow.apache.org",
  "www.writethedocs.org", "developers.google.com", "opensource.guide", "skillshop.withgoogle.com", "academy.hubspot.com",
  "trailhead.salesforce.com",
];

/** Only link to well-known learning hosts; otherwise send the user to a search for the resource name. */
export function safeResourceUrl(name: string, url: string): { url: string; isSearch: boolean } {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && LEARNING_HOSTS.includes(u.hostname)) return { url: u.toString(), isSearch: false };
  } catch {}
  return { url: `https://duckduckgo.com/?q=${encodeURIComponent(name)}`, isSearch: true };
}

/**
 * Post-processes model output so we never present invented evidence:
 * - "demonstrated" requires a quote we can find in the résumé; otherwise it becomes "uncertain".
 * - demonstrated skills must literally appear in the résumé.
 * - resource links are restricted to known learning sites.
 */
export function verifyOutput(out: ModelOutput, resumeText: string, model: string): Analysis {
  const resumeNorm = norm(resumeText);
  const findings: Finding[] = out.findings.map((f) => {
    const evidenceVerified = f.evidence ? quoteInResume(f.evidence, resumeNorm) : false;
    let status = f.status;
    if (status === "demonstrated" && !evidenceVerified) status = "uncertain";
    const resource = safeResourceUrl(f.resource.name || f.requirement, f.resource.url);
    return {
      ...f,
      status,
      evidence: evidenceVerified ? f.evidence : "",
      evidenceVerified,
      resource: { name: f.resource.name || f.requirement, url: resource.url },
    };
  });
  const demonstratedSkills = [...new Set(out.demonstratedSkills)].filter(
    (s) => s && resumeNorm.includes(norm(s)),
  );
  return {
    roleTitle: out.roleTitle,
    summary: out.summary,
    demonstratedSkills,
    findings,
    model,
    createdAt: new Date().toISOString(),
  };
}
