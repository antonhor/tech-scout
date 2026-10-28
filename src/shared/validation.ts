import type { Agency } from "./types";
import { normalizeUrl, normalizeClutch } from "./normalization";
export function validateAgency(a: Agency): string[] {
  const errors: string[] = [];
  if (!a || typeof a !== "object") return ["Company is required."];
  if (typeof a.name !== "string" || !a.name.trim())
    errors.push("Company name is required.");
  for (const k of ["name", "website", "clutchUrl", "notes"] as const)
    if (typeof a[k] !== "string" || a[k].length > 5000)
      errors.push(`Invalid ${k}.`);
  try {
    if (a.website) normalizeUrl(a.website);
    normalizeClutch(a.clutchUrl);
  } catch (e) {
    errors.push((e as Error).message);
  }
  for (const k of [
    "programmingLanguages",
    "frameworksAndTechnologies",
  ] as const)
    if (
      !Array.isArray(a[k]) ||
      a[k].length > 100 ||
      a[k].some(
        (v) => typeof v !== "string" || v.length > 200 || v.includes(","),
      )
    )
      errors.push(`Invalid ${k}: use up to 100 labels without commas.`);
  return errors;
}
