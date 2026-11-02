import type { Board } from "../types";

// Public job boards verified to respond on 2026-11-02. Add or remove entries freely;
// `token` is the board slug used in the provider's public API. Each board costs CPU to
// parse on a cache miss, so check a new one with curl before adding it.
export const BOARDS: Board[] = [
  { provider: "greenhouse", token: "discord", company: "Discord" },
  { provider: "greenhouse", token: "duolingo", company: "Duolingo" },
  { provider: "greenhouse", token: "mongodb", company: "MongoDB" },
  { provider: "greenhouse", token: "elastic", company: "Elastic" },
  { provider: "greenhouse", token: "datadog", company: "Datadog" },
  { provider: "greenhouse", token: "gitlab", company: "GitLab" },
  { provider: "lever", token: "spotify", company: "Spotify" },
  { provider: "lever", token: "outreach", company: "Outreach" },
  { provider: "ashby", token: "linear", company: "Linear" },
  { provider: "ashby", token: "supabase", company: "Supabase" },
  { provider: "ashby", token: "notion", company: "Notion" },
  // Africa-based employers (Lagos/Abuja roles verified 2026-11-02).
  { provider: "greenhouse", token: "moniepoint", company: "Moniepoint" },
  { provider: "workable", token: "kuda", company: "Kuda" },
  { provider: "ashby", token: "andela", company: "Andela" },
  // Non-tech roles: healthcare (physicians, actuaries), education.
  { provider: "greenhouse", token: "oscar", company: "Oscar Health" },
  { provider: "greenhouse", token: "coursera", company: "Coursera" },
  { provider: "greenhouse", token: "khanacademy", company: "Khan Academy" },
  { provider: "workable", token: "huggingface", company: "Hugging Face" },
  { provider: "recruitee", token: "bunq", company: "bunq" },
  // Remote-job aggregators: one feed, many companies. `company` here is only the feed's name.
  // Their terms require visible credit and a link back, which JobCard shows as "via …".
  { provider: "himalayas", token: "remote", company: "Himalayas" },
  { provider: "jobicy", token: "remote", company: "Jobicy" },
  { provider: "remoteok", token: "remote", company: "Remote OK" },
  { provider: "arbeitnow", token: "europe", company: "Arbeitnow" },
];
