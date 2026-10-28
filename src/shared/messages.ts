export function isTrustedExtensionPage(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
) {
  if (sender.id !== extensionId || !sender.url) return false;
  const page = sender.url.split(/[?#]/)[0];
  return ["src/options/index.html", "src/popup/index.html"].some(
    (path) => page === `chrome-extension://${extensionId}/${path}`,
  );
}
