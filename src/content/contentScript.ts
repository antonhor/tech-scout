import { clutchExtractor } from "./clutchExtractor";
const marker = "clutchCollectorInstalled";
const scope = globalThis as unknown as Record<string, unknown>;
if (!scope[marker]) {
  scope[marker] = true;
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type !== "EXTRACT") return;
    try {
      if (!clutchExtractor.supports(location.href))
        throw Error("Unsupported page.");
      reply({ result: clutchExtractor.extract(document, location.href) });
    } catch (e) {
      reply({ error: (e as Error).message });
    }
  });
}
