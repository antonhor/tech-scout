import type { CompanyExtractor, ExtractionResult } from "../shared/types";
import {
  extractFocusTechnologies,
  focusDiagnostics,
} from "./focusTechnologies";
import { extractCompanyWebsite } from "./companyWebsite";
import {
  classify,
  normalizeClutch,
  supportsProfile,
} from "../shared/normalization";
export const selectors = {
  root: "[data-company-profile], .profile-header, .profile",
  name: "[data-company-name], h1",
  website:
    "a[data-company-website], a.website-link, a.profile-header__website-link",
  websiteRedirect: 'a[href*="r.clutch.co/redirect"]',
  technologies:
    '[data-technology], [data-section="programming-languages"] li, [data-section="frameworks"] li, .profile__focus .chart-label',
};
export const clutchExtractor: CompanyExtractor = {
  supports: supportsProfile,
  extract(doc, url): ExtractionResult {
    const root = doc.querySelector(selectors.root);
    const warnings: string[] = [];
    let name = root?.querySelector(selectors.name)?.textContent?.trim() ?? "";
    const website = extractCompanyWebsite(
      doc,
      root,
      url,
      selectors.website,
      selectors.websiteRedirect,
    );
    for (const script of doc.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      try {
        const parsed = JSON.parse(script.textContent ?? "");
        const items = Array.isArray(parsed)
          ? parsed
          : (parsed["@graph"] ?? [parsed]);
        for (const item of items) {
          if (!["Organization", "ProfessionalService"].includes(item["@type"]))
            continue;
          const identity = item["@id"] ?? item.mainEntityOfPage;
          if (
            typeof identity !== "string" ||
            !supportsProfile(identity) ||
            normalizeClutch(identity) !== normalizeClutch(url)
          )
            continue;
          if (!name && typeof item.name === "string") name = item.name;
        }
      } catch {
        warnings.push("Invalid structured data was ignored.");
      }
    }
    const tech = classify([
      ...(root
        ? [...root.querySelectorAll(selectors.technologies)].map(
            (e) => e.getAttribute("data-technology") || e.textContent || "",
          )
        : []),
      ...extractFocusTechnologies(doc),
    ]);
    if (!root)
      warnings.push("Unrecognized layout. Enter company details manually.");
    if (!name) warnings.push("Company name not found.");
    if (!website)
      warnings.push(
        "Verified website link not found or ambiguous; enter it manually.",
      );
    if (
      !tech.programmingLanguages.length &&
      !tech.frameworksAndTechnologies.length
    )
      warnings.push(
        "No technologies found. Unknown labels are placed under technologies for review.",
      );
    return {
      agency: {
        name,
        website,
        clutchUrl: normalizeClutch(url),
        ...tech,
        notes: "",
      },
      warnings,
      diagnostics: focusDiagnostics(doc),
    };
  },
};
