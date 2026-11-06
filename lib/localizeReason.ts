type Text = (source: string, values?: Record<string, string | number>) => string;
/** Localize our own rule-engine explanations; job titles and source text stay original. */
export function localizeReason(reason: string, t: Text): string {
  let match: RegExpMatchArray | null;
  if ((match = reason.match(/^You have (\d+) of the (\d+) skills it lists$/))) return t("You have {matched} of the {total} skills it lists", { matched: Number(match[1]), total: Number(match[2]) });
  if ((match = reason.match(/^Location fits \((.*)\)$/))) return t("Location fits ({location})", { location: match[1] });
  if ((match = reason.match(/^Location may not fit: (.*)$/))) return t("Location may not fit: {location}", { location: match[1] });
  if ((match = reason.match(/^Remote, limited to: (.*)$/))) return t("Remote, limited to: {location}", { location: match[1] });
  if ((match = reason.match(/^Work style is (.*), you prefer (.*)$/))) {
    const styles: Record<string, string> = { remote: "Remote", onsite: "On-site", hybrid: "Hybrid", any: "Any" };
    return t("Work style: {actual}. Your preference: {preferred}.", { actual: t(styles[match[1]] ?? match[1]), preferred: t(styles[match[2]] ?? match[2]) });
  }
  if ((match = reason.match(/^Requires (.*?)(?: — check you qualify)?$/))) return t("Requires {requirements} — check you qualify", { requirements: match[1].split(" and ").map((part) => t(part)).join(t(" and ")) });
  if ((match = reason.match(/^Open to (.*)$/))) return t("Open to {location}", { location: match[1] });
  if ((match = reason.match(/^Not listed for (.*)$/))) return t("Not listed for {location}", { location: match[1] });
  return t(reason);
}
