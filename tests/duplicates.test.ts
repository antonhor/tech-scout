import { describe, expect, it } from "vitest";
import { match } from "../src/shared/duplicates";
import type { Agency } from "../src/shared/types";

const agency: Agency = {
  name: "Example Studio",
  website: "https://example.com",
  clutchUrl: "https://clutch.co/profile/example",
  programmingLanguages: [],
  frameworksAndTechnologies: [],
  notes: "",
};

describe("partial legacy duplicate identifiers", () => {
  it.each([
    "",
    "   ",
    "not a Clutch URL",
    "https://clutch.co/developers",
    "https://clutch.co/profile/other/reviews",
  ])(
    "uses website domain when existing Clutch URL is unavailable: %j",
    (clutchUrl) => {
      expect(
        match(agency, {
          ...agency,
          clutchUrl,
          website: "http://www.EXAMPLE.com/about?utm_source=clutch#team",
          name: "Other name",
        }),
      ).toBe("domain");
    },
  );
  it.each([
    "",
    "not a website",
    "https://user:password@example.com",
    "https://example.com/?%=bad",
  ])(
    "falls back to normalized name despite an unusable website: %j",
    (website) => {
      expect(
        match(agency, {
          ...agency,
          clutchUrl: "",
          website,
          name: "  EXAMPLE   Studio ",
        }),
      ).toBe("name");
    },
  );
  it("does not let an invalid identifier hide matches in the other direction", () => {
    expect(match({ ...agency, clutchUrl: "" }, agency)).toBe("domain");
  });
  it("falls back to the name when valid Clutch URLs differ and the existing website is malformed", () => {
    expect(
      match(agency, {
        ...agency,
        clutchUrl: "https://clutch.co/profile/other",
        website: "broken website",
      }),
    ).toBe("name");
  });
  it("does not match empty or whitespace-only identifiers", () => {
    expect(
      match(
        { ...agency, name: "", website: "", clutchUrl: "" },
        { ...agency, name: "  ", website: " ", clutchUrl: " " },
      ),
    ).toBeUndefined();
  });
  it("does not match two malformed URLs", () => {
    expect(
      match(
        {
          ...agency,
          name: "First",
          website: "bad website",
          clutchUrl: "bad profile",
        },
        {
          ...agency,
          name: "Second",
          website: "bad website",
          clutchUrl: "bad profile",
        },
      ),
    ).toBeUndefined();
  });
  it("keeps Clutch before domain before name priority", () => {
    expect(
      match(agency, {
        ...agency,
        clutchUrl: "https://www.clutch.co/profile/EXAMPLE/?ref=x",
        website: "broken website",
      }),
    ).toBe("clutch");
    expect(match(agency, { ...agency, clutchUrl: "" })).toBe("domain");
    expect(
      match(agency, {
        ...agency,
        clutchUrl: "",
        website: "https://other.example",
      }),
    ).toBe("name");
  });
  it("keeps different company subdomains distinct", () => {
    expect(
      match(agency, {
        ...agency,
        name: "Other",
        website: "https://team.example.com",
        clutchUrl: "",
      }),
    ).toBeUndefined();
  });
});
