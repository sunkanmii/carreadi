export interface CareerPath {
  id: string;
  label: string;
  /** Title keywords used to match postings to this path. */
  titles: RegExp;
}

export const CAREER_PATHS: CareerPath[] = [
  { id: "software", label: "Software engineering", titles: /\b(software|full[- ]?stack|engineer|developer)\b/i },
  { id: "frontend", label: "Frontend engineering", titles: /\b(front[- ]?end|ui engineer|web engineer|react)\b/i },
  { id: "backend", label: "Backend engineering", titles: /\b(back[- ]?end|api|platform|server|distributed)\b/i },
  { id: "data-science", label: "Data science / ML", titles: /\b(data scien|machine learning|\bml\b|ai engineer|research (engineer|scientist))/i },
  { id: "data-analytics", label: "Data analytics", titles: /\b(analyst|analytics|business intelligence|\bbi\b)/i },
  { id: "devops", label: "DevOps / SRE / Infra", titles: /\b(devops|sre|site reliability|infrastructure|cloud)\b/i },
  { id: "security", label: "Security", titles: /\b(security|appsec|detection|trust)\b/i },
  { id: "product", label: "Product management", titles: /\b(product manager|product lead|\bpm\b|program manager)/i },
  { id: "design", label: "Design / UX", titles: /\b(designer|design|ux|ui|user research)/i },
  // \bwriter never matches "Underwriter".
  { id: "devrel", label: "Technical writing / DevRel", titles: /\b(writer|documentation|developer (relations|advocate|experience|education)|devrel)/i },
  { id: "solutions", label: "Solutions / Sales engineering", titles: /\b(solutions?|sales engineer|forward deployed|customer engineer)/i },
  { id: "support", label: "Customer success / Support", titles: /\b(customer success|support|account manager|onboarding)/i },
  { id: "marketing", label: "Marketing", titles: /\b(marketing|growth|content|brand|community|copywriter|editor|social media)/i },
  // Non-tech paths. Many employers on our boards hire for these too, and the aggregators carry plenty.
  { id: "sales", label: "Sales / Business development", titles: /\b(sales|account executive|business development|bdr|sdr|partnerships?)\b/i },
  { id: "finance", label: "Finance / Accounting", titles: /\b(accountant|accounting|finance|financial|audit|tax|payroll|treasury|actuar|controller|bookkeep|credit)/i },
  { id: "hr", label: "HR / Recruiting / People", titles: /\b(recruit|talent|human resources|\bhr\b|people (ops|operations|partner)|hrbp)/i },
  { id: "healthcare", label: "Healthcare / Medical", titles: /\b(nurse|nursing|physician|doctor|medical|clinical|clinician|pharmac|therapist|health coach|care coordinator|practice provider|dentist|midwife)/i },
  { id: "education", label: "Education / Training", titles: /\b(teacher|tutor|instructor|lecturer|curriculum|education|educator|learning (designer|experience)|trainer|facilitator)/i },
  { id: "legal", label: "Legal / Compliance", titles: /\b(legal|counsel|lawyer|attorney|paralegal|compliance|regulatory)/i },
  { id: "admin", label: "Admin / Office support", titles: /\b(administrative|admin assistant|executive assistant|office (manager|assistant)|receptionist|secretary|data entry|virtual assistant)/i },
  { id: "logistics", label: "Logistics / Supply chain", titles: /\b(logistics|supply chain|procurement|purchasing|warehouse|inventory|fleet|dispatch|fulfil?ment)/i },
  { id: "project", label: "Project management", titles: /\b(project manager|project coordinator|scrum master|delivery manager|pmo)\b/i },
  { id: "operations", label: "Operations", titles: /\b(operations|ops\b|business operations|chief of staff)/i },
];

export function careerById(id: string | null | undefined) {
  return CAREER_PATHS.find((c) => c.id === id) ?? null;
}

/**
 * Best-guess career path from the résumé's headline (first lines) and file name.
 * Specific paths are tried before the catch-all "software", so "Backend Software Engineer"
 * becomes backend. Returns "" when nothing matches; the user can always change it.
 */
export function guessCareerPath(resumeText: string, fileName = ""): string {
  const lines = [
    fileName.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " "),
    // Headlines are short; long lines are experience sentences ("Wrote documentation…") and mislead.
    // Section headings ("Education: BSc…") are skipped, or every résumé would look like a teacher's.
    ...resumeText
      .split("\n")
      .map((l) => l.trim())
      .slice(0, 6)
      .filter((l) => l && l.length <= 80 && !SECTION_HEADING.test(l))
      .slice(0, 3),
  ];
  const ordered = [...CAREER_PATHS.filter((c) => c.id !== "software"), ...CAREER_PATHS.filter((c) => c.id === "software")];
  // Earliest line wins: the file name and headline say more than anything below them.
  for (const line of lines) {
    const hit = ordered.find((c) => c.titles.test(line));
    if (hit) return hit.id;
  }
  return "";
}

const SECTION_HEADING = /^(education|experience|work experience|skills|summary|profile|contact|certifications?|projects|references)\b/i;

/**
 * Skills we look for in job text. Matching against this fixed list keeps job
 * recommendations transparent: every match can be shown to the user.
 */
export const SKILL_LEXICON = [
  "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "Ruby", "C++", "C#", "Kotlin", "Swift", "Scala", "PHP", "Elixir",
  "SQL", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch", "Kafka", "GraphQL", "REST", "gRPC", "OpenAPI",
  "React", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "HTML", "CSS", "Tailwind", "React Native", "iOS", "Android",
  "AWS", "GCP", "Azure", "Cloudflare", "Docker", "Kubernetes", "Terraform", "Linux", "CI/CD", "Git", "Observability",
  "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "LLM", "NLP", "Computer Vision", "Statistics", "A/B testing",
  "Pandas", "Spark", "Airflow", "dbt", "Snowflake", "BigQuery", "Tableau", "Looker", "Excel", "ETL", "Data modeling",
  "Distributed systems", "Microservices", "System design", "Security", "OAuth", "Cryptography", "Networking",
  "Figma", "Prototyping", "User research", "Design systems", "Accessibility",
  "Technical writing", "Documentation", "API documentation", "Docs-as-code", "Markdown", "Tutorials", "Style guide",
  "Content strategy", "Editing", "Information architecture", "Developer experience", "SDK", "API design", "Open source",
  "Product strategy", "Roadmapping", "Stakeholder management", "Project management", "Agile", "Analytics",
  "SEO", "Content marketing", "Copywriting", "CRM", "Salesforce", "HubSpot", "Customer success", "Sales",
  "Communication", "Leadership", "Mentoring",
  // Non-tech skills
  "Accounting", "Bookkeeping", "Financial modeling", "Financial reporting", "Budgeting", "Forecasting", "Auditing", "IFRS", "GAAP",
  "QuickBooks", "Payroll", "Tax compliance", "Credit analysis", "Risk management",
  "Recruiting", "Talent acquisition", "Employee relations", "Performance management", "HRIS",
  "Lead generation", "Cold calling", "Account management", "Business development", "Negotiation", "Customer service", "Zendesk",
  "Patient care", "Nursing", "Electronic health records", "Clinical documentation", "Pharmacology",
  "Curriculum development", "Lesson planning", "Classroom management", "Instructional design",
  "Contract drafting", "Legal research", "Regulatory compliance", "KYC", "AML",
  "Microsoft Office", "Google Workspace", "Scheduling", "Data entry", "Event planning",
  "Supply chain", "Procurement", "Logistics", "Inventory management", "Vendor management",
  "Social media", "Public speaking", "Graphic design", "Canva", "Adobe Photoshop", "Video editing", "Translation",
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Words that are also common English need stricter, case-sensitive patterns.
const OVERRIDES: Record<string, RegExp> = {
  Go: /\bGolang\b|\bGo(?=\s*(,|\/|\)|or\b|and\b))|[(,/]\s*Go\b/,
  REST: /\bREST(ful)?\b/,
  Rust: /\bRust\b/,
  Swift: /\bSwift\b/,
  Spark: /\bSpark\b/,
  Excel: /\bExcel\b/,
  Looker: /\bLooker\b/,
  Security: /\bsecurity (engineering|review|best practices)|\bappsec\b|\binfosec\b/i,
  Sales: /\bsales (cycle|process|experience|engineering)\b|\bB2B sales\b/i,
  Analytics: /\banalytics\b/i,
  Communication: /\bcommunication skills\b/i,
  Leadership: /\b(technical )?leadership\b/i,
  KYC: /\bKYC\b/,
  AML: /\bAML\b/,
  IFRS: /\bIFRS\b/,
  GAAP: /\bGAAP\b/,
  HRIS: /\bHRIS\b/,
};

const SKILL_RES = new Map(
  SKILL_LEXICON.map((s) => [s, OVERRIDES[s] ?? new RegExp(`(^|[^a-z0-9+#])${escapeRe(s)}(?![a-z0-9+#])`, "i")]),
);

export function skillsIn(text: string, candidates: Iterable<string> = SKILL_LEXICON): string[] {
  const found: string[] = [];
  for (const s of candidates) {
    const re = SKILL_RES.get(s) ?? new RegExp(`(^|[^a-z0-9+#])${escapeRe(s)}(?![a-z0-9+#])`, "i");
    if (re.test(text)) found.push(s);
  }
  return found;
}
