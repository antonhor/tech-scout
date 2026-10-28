// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { clutchExtractor } from "../src/content/clutchExtractor";
const profile = "https://clutch.co/profile/we-create-digital";
const destination =
  "https://wecreate.digital/services/web-development/?utm_source=clutch.co&utm_medium=referral&utm_campaign=directory";
const expected = "https://wecreate.digital/services/web-development";
function redirect(overrides: Record<string, string | null> = {}) {
  const params = new URLSearchParams({
    analyticsjs: "true",
    event_category: "visit_website",
    from_page: "https://clutch.co/developers?page=4",
    page_location: profile,
    provider_website: "wecreate.digital",
    u: destination,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v !== null),
    ),
  } as Record<string, string>);
  for (const [key, value] of Object.entries(overrides))
    if (value === null) params.delete(key);
  return `https://r.clutch.co/redirect?${params}`;
}
function link(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "Visit Website";
  return a.outerHTML;
}
function extract(html: string) {
  return clutchExtractor.extract(
    new DOMParser().parseFromString(html, "text/html"),
    profile,
  ).agency.website;
}
function header(body: string) {
  return `<header class="profile-header"><h1>We Create Digital</h1>${body}</header>`;
}
describe("Visit Website redirects (query contract provided by user)", () => {
  it("decodes u without fetching the redirect and removes tracking", () =>
    expect(extract(header(link(redirect())))).toBe(expected));
  it("handles HTML-escaped ampersands", () =>
    expect(
      extract(
        header(link(redirect()).replace(/&amp;/g, "&").replace(/&/g, "&amp;")),
      ),
    ).toBe(expected));
  it("accepts a matching profile CTA outside the header and deduplicates repeated buttons", () =>
    expect(
      extract(
        header(link(redirect())) + link(redirect({ trace_id: "second" })),
      ),
    ).toBe(expected));
  it("does not take destination from from_page or transport_url", () =>
    expect(
      extract(
        header(
          link(
            redirect({
              u: null,
              provider_website: null,
              transport_url: "https://g.clutch.co",
            }),
          ),
        ),
      ),
    ).toBe(""));
  it("can use provider_website when u is absent", () =>
    expect(extract(header(link(redirect({ u: null }))))).toBe(
      "https://wecreate.digital",
    ));
  it("rejects a redirect for another profile", () =>
    expect(
      extract(
        header(
          link(redirect({ page_location: "https://clutch.co/profile/other" })),
        ),
      ),
    ).toBe(""));
  it("rejects unrelated redirect buttons outside the header without profile identity", () =>
    expect(extract(header("") + link(redirect({ page_location: null })))).toBe(
      "",
    ));
  it("ignores recommendation website links", () =>
    expect(extract(header("") + `<aside>${link(redirect())}</aside>`)).toBe(
      "",
    ));
  it("rejects mismatched provider domains", () =>
    expect(
      extract(header(link(redirect({ provider_website: "other.example" })))),
    ).toBe(""));
  it.each([
    "javascript:alert(1)",
    "https://user:password@wecreate.digital/",
    "https://r.clutch.co/redirect",
    "https://clutch.co/profile/other",
  ])("rejects unsafe/internal target %s", (u) =>
    expect(extract(header(link(redirect({ u, provider_website: null }))))).toBe(
      "",
    ),
  );
  it("leaves conflicting verified destinations empty", () =>
    expect(
      extract(
        header(
          link(redirect()) +
            link(
              redirect({
                u: "https://other.example",
                provider_website: "other.example",
              }),
            ),
        ),
      ),
    ).toBe(""));
  it("does not accept redirect lookalike hosts", () =>
    expect(
      extract(
        header(
          link(redirect().replace("r.clutch.co/", "r.clutch.co.evil.example/")),
        ),
      ),
    ).toBe(""));
});
