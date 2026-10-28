import type { Agency, Candidate } from "./types";
import {
  normalizeClutch,
  normalizeDomain,
  normalizeName,
} from "./normalization";
function availableIdentifier(
  value: string,
  normalize: (value: string) => string,
): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return normalize(value);
  } catch {
    // Existing imports can contain incomplete URLs. Only this comparison key
    // is unavailable; keep trying the other keys. Incoming data is validated
    // separately by validateAgency before this matcher is called.
    return "";
  }
}
function sameIdentifier(
  a: string,
  b: string,
  normalize: (value: string) => string,
): boolean {
  const left = availableIdentifier(a, normalize);
  return !!left && left === availableIdentifier(b, normalize);
}
export function match(a: Agency, b: Agency): Candidate["reason"] | undefined {
  if (sameIdentifier(a.clutchUrl, b.clutchUrl, normalizeClutch))
    return "clutch";
  if (sameIdentifier(a.website, b.website, normalizeDomain)) return "domain";
  if (sameIdentifier(a.name, b.name, normalizeName)) return "name";
}
