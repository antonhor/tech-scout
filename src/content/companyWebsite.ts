import {
  normalizeClutch,
  normalizeDomain,
  normalizeUrl,
  supportsProfile,
} from "../shared/normalization";

const excluded =
  "aside,footer,nav,[data-review],.review,.reviews,.recommendations";
function externalWebsite(value: string): string {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";
  const host = new URL(normalized).hostname;
  return host === "clutch.co" || host.endsWith(".clutch.co") ? "" : normalized;
}
function redirectTarget(
  link: HTMLAnchorElement,
  profileUrl: string,
  inProfile: boolean,
): string {
  try {
    const redirect = new URL(link.getAttribute("href") ?? "", profileUrl);
    if (
      redirect.origin !== "https://r.clutch.co" ||
      redirect.pathname !== "/redirect" ||
      redirect.username ||
      redirect.password
    )
      return "";
    if (redirect.searchParams.get("event_category") !== "visit_website")
      return "";
    const location = redirect.searchParams.get("page_location");
    // A redirect elsewhere on the page must explicitly identify this profile.
    if (location) {
      if (
        !supportsProfile(location) ||
        normalizeClutch(location) !== normalizeClutch(profileUrl)
      )
        return "";
    } else if (!inProfile) return "";
    const destination = redirect.searchParams.get("u");
    const provider = redirect.searchParams.get("provider_website");
    const target = externalWebsite(destination ?? provider ?? "");
    if (!target) return "";
    if (provider && normalizeDomain(provider) !== normalizeDomain(target))
      return "";
    return target;
  } catch {
    return "";
  }
}
export function extractCompanyWebsite(
  doc: Document,
  root: Element | null,
  profileUrl: string,
  directSelector: string,
  redirectSelector: string,
): string {
  const values: string[] = [];
  if (root)
    for (const link of root.querySelectorAll<HTMLAnchorElement>(
      directSelector,
    )) {
      if (link.closest(excluded)) continue;
      try {
        const href = link.getAttribute("href") ?? "";
        if (!/^https?:\/\//i.test(href)) continue;
        const target = externalWebsite(href);
        if (target) values.push(target);
      } catch {
        /* Invalid website candidates are left empty for manual correction. */
      }
    }
  for (const link of doc.querySelectorAll<HTMLAnchorElement>(
    redirectSelector,
  )) {
    if (link.closest(excluded)) continue;
    const target = redirectTarget(link, profileUrl, !!root?.contains(link));
    if (target) values.push(target);
  }
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : "";
}
