import { afterEach, describe, expect, it, vi } from "vitest";
import { isTrustedExtensionPage } from "../src/shared/messages";
import { callApi } from "../src/services/extensionApi";
afterEach(() => vi.unstubAllGlobals());
describe("extension messaging", () => {
  it("accepts Settings opened in a Chrome tab", () => {
    expect(
      isTrustedExtensionPage(
        {
          id: "extension",
          url: "chrome-extension://extension/src/options/index.html",
          tab: { id: 1 } as chrome.tabs.Tab,
        },
        "extension",
      ),
    ).toBe(true);
  });
  it("accepts the popup", () =>
    expect(
      isTrustedExtensionPage(
        {
          id: "extension",
          url: "chrome-extension://extension/src/popup/index.html",
        },
        "extension",
      ),
    ).toBe(true));
  it("rejects content script and other extension senders", () => {
    expect(
      isTrustedExtensionPage(
        { id: "extension", url: "https://clutch.co/profile/example" },
        "extension",
      ),
    ).toBe(false);
    expect(
      isTrustedExtensionPage(
        {
          id: "other",
          url: "chrome-extension://extension/src/options/index.html",
        },
        "extension",
      ),
    ).toBe(false);
  });
  it("explains missing worker responses without reading success from undefined", async () => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    });
    await expect(
      callApi({ operation: "healthCheck", requestId: "test" }),
    ).rejects.toThrow("background worker did not respond");
  });
});
