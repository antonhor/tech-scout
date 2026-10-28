import { parseHttp } from "./url";
export const normalizeName = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function normalizeUrl(s: string): string {
  if (!s.trim()) return "";
  const u = parseHttp(
    /^[a-z]+:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`,
  );
  const query = u.search
    .slice(1)
    .split("&")
    .filter(Boolean)
    .filter(
      (pair) =>
        !/^(utm_|fbclid$|gclid$|ref$)/i.test(
          decodeURIComponent(pair.split("=")[0]),
        ),
    )
    .join("&");
  return `${u.protocol}//${u.hostname}${u.port}${u.pathname.replace(/\/$/, "")}${query ? "?" + query : ""}`;
}
export function normalizeDomain(s: string): string {
  return s ? parseHttp(normalizeUrl(s)).hostname.replace(/^www\./, "") : "";
}
export const profilePatterns = [/^\/profile\/[a-z0-9][a-z0-9_-]*\/?$/i];
export function supportsProfile(s: string): boolean {
  try {
    const u = parseHttp(s);
    return (
      u.protocol === "https:" &&
      !u.port &&
      ["clutch.co", "www.clutch.co"].includes(u.hostname) &&
      profilePatterns.some((p) => p.test(u.pathname))
    );
  } catch {
    return false;
  }
}
export function normalizeClutch(s: string): string {
  if (!supportsProfile(s))
    throw Error("Use a supported https://clutch.co/profile/company URL.");
  const u = parseHttp(s);
  return `https://clutch.co${u.pathname.replace(/\/$/, "").toLowerCase()}`;
}
export const unique = (values: string[]) => [
  ...new Map(
    values
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => [v.toLowerCase(), v]),
  ).values(),
];
const languages = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "PHP",
  "C#",
  "C++",
  "Go",
  "Ruby",
  "Kotlin",
  "Swift",
  "Rust",
  "Scala",
  "Dart",
  "Objective-C",
  "SQL",
];
const tools = [
  "Angular",
  "React",
  "Vue",
  "Node.js",
  "NestJS",
  "Next.js",
  "Laravel",
  "Django",
  "Spring",
  ".NET",
  "AWS",
  "Docker",
  "React Native",
  "Flutter",
];
const aliases: Record<string, string> = {
  "objective c": "Objective-C",
  reactjs: "React",
  "react.js": "React",
  vuejs: "Vue",
  "vue.js": "Vue",
  nodejs: "Node.js",
  nextjs: "Next.js",
  golang: "Go",
  "c sharp": "C#",
  "asp.net": ".NET",
};
export function classify(values: string[]) {
  const programmingLanguages: string[] = [],
    frameworksAndTechnologies: string[] = [];
  for (const raw of unique(values)) {
    const label = raw
      .replace(/^\d+(?:\.\d+)?\s*%\s*/, "")
      .replace(/\s*\d+(?:\.\d+)?\s*%$/, "")
      .trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const value =
      aliases[key] ??
      [...languages, ...tools].find((v) => v.toLowerCase() === key) ??
      label;
    (languages.includes(value)
      ? programmingLanguages
      : frameworksAndTechnologies
    ).push(value);
  }
  return {
    programmingLanguages: unique(programmingLanguages),
    frameworksAndTechnologies: unique(frameworksAndTechnologies),
  };
}
export function mergeAgency(
  old: import("./types").Agency,
  next: import("./types").Agency,
) {
  return {
    ...old,
    ...next,
    name: next.name || old.name,
    website: next.website || old.website,
    notes: next.notes || old.notes,
    programmingLanguages: unique([
      ...old.programmingLanguages,
      ...next.programmingLanguages,
    ]),
    frameworksAndTechnologies: unique([
      ...old.frameworksAndTechnologies,
      ...next.frameworksAndTechnologies,
    ]),
    id: old.id,
    createdAt: old.createdAt,
  };
}
