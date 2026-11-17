import { htmlToText } from "./html";
import { fetchPage, JobLinkError, publicHttpUrl } from "./jobs/link";

const PER_LINK = 5000;

/** What one shared link shows, as plain text for the reviewer. Never throws: problems become text. */
export async function proofText(raw: string): Promise<string> {
  const u = publicHttpUrl(raw);
  if (!u) return `LINK ${raw}: not a public https link.`;
  try {
    // GitHub repos: the README is the project's own write-up. Raw files aren't rate limited like the API.
    if (u.hostname === "github.com") {
      const [owner, repo] = u.pathname.split("/").filter(Boolean);
      if (owner && repo && /^[\w.-]+$/.test(owner + repo)) {
        for (const name of ["README.md", "readme.md", "README.MD", "README"]) {
          const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, "")}/HEAD/${name}`, { signal: AbortSignal.timeout(8000) });
          if (res.ok) return `LINK ${u.href} (GitHub repository ${owner}/${repo}), README:\n${(await res.text()).slice(0, PER_LINK)}`;
        }
        return `LINK ${u.href}: GitHub repository with no README, or it is private.`;
      }
    }
    const page = await fetchPage(u);
    const title = page.html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? "";
    const text = htmlToText(page.html.slice(0, 300_000)).slice(0, PER_LINK);
    return `LINK ${page.url.href}${title ? ` (title: ${title})` : ""}:\n${text || "(no readable text; it may be an app that needs JavaScript)"}`;
  } catch (e) {
    return `LINK ${u.href}: could not be opened (${e instanceof JobLinkError ? e.message : "no response"}).`;
  }
}
