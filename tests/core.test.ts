// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  normalizeName,
  normalizeDomain,
  normalizeUrl,
  normalizeClutch,
  classify,
  unique,
  mergeAgency,
  supportsProfile,
} from "../src/shared/normalization";
import { validateAgency } from "../src/shared/validation";
import { match } from "../src/shared/duplicates";
import { parseResponse } from "../src/services/appsScriptClient";
import { clutchExtractor } from "../src/content/clutchExtractor";
import { safeCell } from "../apps-script/index";
import { isCommittedResult } from "../src/shared/result";
import complete from "./fixtures/complete.html?raw";
import missingWebsite from "./fixtures/missing-website.html?raw";
import missingTech from "./fixtures/missing-technologies.html?raw";
import unexpected from "./fixtures/unexpected.html?raw";
import external from "./fixtures/external-links.html?raw";
import invalid from "./fixtures/invalid-json.html?raw";
const agency = {
  name: "Example",
  website: "https://example.com",
  clutchUrl: "https://clutch.co/profile/example",
  programmingLanguages: ["Python"],
  frameworksAndTechnologies: ["Django"],
  notes: "",
};
describe("normalization", () => {
  it("normalizes names", () =>
    expect(normalizeName("  ＡＣＭＥ   Studio ")).toBe("acme studio"));
  it("normalizes domains and keeps subdomains", () => {
    expect(normalizeDomain("HTTP://WWW.Example.COM/path?q=1#x")).toBe(
      "example.com",
    );
    expect(normalizeDomain("https://team.example.com")).toBe(
      "team.example.com",
    );
    expect(normalizeDomain("https://bücher.de")).toBe("xn--bcher-kva.de");
  });
  it("removes tracking while retaining meaningful queries", () =>
    expect(normalizeUrl("https://EXAMPLE.com/a?utm_source=x&id=1#f")).toBe(
      "https://example.com/a?id=1",
    ));
  it("rejects unsafe URLs", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeUrl("https://user:pass@example.com")).toThrow();
  });
  it("canonicalizes profile links", () =>
    expect(
      normalizeClutch("https://www.clutch.co/profile/Example/?ref=x"),
    ).toBe(agency.clutchUrl));
  it.each([
    "https://clutch.co/",
    "https://clutch.co/developers",
    "https://clutch.co/profile/x/reviews",
    "https://clutch.co.evil.com/profile/x",
  ])("rejects unsupported %s", (u) => expect(supportsProfile(u)).toBe(false));
  it("classifies known and preserves unknown labels", () =>
    expect(classify(["40% Python", "reactjs", "Custom Tool"])).toEqual({
      programmingLanguages: ["Python"],
      frameworksAndTechnologies: ["React", "Custom Tool"],
    }));
  it("deduplicates case insensitively", () =>
    expect(unique(["React", "react", " React "])).toHaveLength(1));
});
describe("validation and duplicates", () => {
  it("does not treat a duplicate check as a committed save after popup closure", () => {
    expect(
      isCommittedResult(
        {
          requestId: "draft",
          operation: "checkDuplicate",
          result: { success: true, status: "SKIPPED" },
        },
        "draft",
      ),
    ).toBe(false);
    expect(
      isCommittedResult(
        {
          requestId: "draft",
          operation: "createCompany",
          result: { success: true, status: "ADDED" },
        },
        "draft",
      ),
    ).toBe(true);
  });
  it("accepts optional missing website", () =>
    expect(validateAgency({ ...agency, website: "" })).toEqual([]));
  it("requires a name", () =>
    expect(validateAgency({ ...agency, name: "" })).not.toEqual([]));
  it("matches profile first", () =>
    expect(match(agency, { ...agency, name: "Other" })).toBe("clutch"));
  it("matches domain", () =>
    expect(
      match(agency, {
        ...agency,
        clutchUrl: "https://clutch.co/profile/other",
      }),
    ).toBe("domain"));
  it("name is a possible match", () =>
    expect(
      match(agency, {
        ...agency,
        website: "",
        clutchUrl: "https://clutch.co/profile/other",
      }),
    ).toBe("name"));
  it("merges without implicitly clearing existing data", () => {
    const merged = mergeAgency(
      { ...agency, notes: "keep", id: "stable" },
      { ...agency, notes: "", programmingLanguages: ["Java"] },
    );
    expect(merged.notes).toBe("keep");
    expect(merged.id).toBe("stable");
    expect(merged.programmingLanguages).toEqual(["Python", "Java"]);
  });
  it("validates response envelope", () => {
    expect(() => parseResponse("<html>login</html>")).toThrow();
    expect(() =>
      parseResponse({ success: true, status: "DUPLICATE_FOUND" }),
    ).toThrow();
    expect(parseResponse({ success: true, status: "ADDED" }).status).toBe(
      "ADDED",
    );
  });
  it.each(["=IMPORTXML(1)", "+1", "-1", "@SUM(1)", " \t=1"])(
    "escapes formula %s",
    (v) => expect(safeCell(v)).toBe("'" + v),
  );
});
function extract(html: string) {
  return clutchExtractor.extract(
    new DOMParser().parseFromString(html, "text/html"),
    agency.clutchUrl,
  );
}
describe("fixture extraction (synthetic, not live verification)", () => {
  it("extracts profile only", () => {
    const r = extract(complete);
    expect(r.agency.name).toBe("Example Studio");
    expect(r.agency.programmingLanguages).toEqual(["Python"]);
    expect(r.agency.website).toBe("https://www.example.com");
  });
  it("leaves missing website empty", () =>
    expect(extract(missingWebsite).agency.website).toBe(""));
  it("leaves missing tech empty", () =>
    expect(extract(missingTech).agency.frameworksAndTechnologies).toEqual([]));
  it("does not use arbitrary heading on unknown layout", () =>
    expect(extract(unexpected).agency.name).toBe(""));
  it("ignores unrelated external links", () =>
    expect(extract(external).agency.website).toBe("https://official.example"));
  it("reports invalid structured data", () =>
    expect(extract(invalid).warnings).toContain(
      "Invalid structured data was ignored.",
    ));
});
