import { request } from "../services/appsScriptClient";
import { isTrustedExtensionPage } from "../shared/messages";
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    !isTrustedExtensionPage(sender, chrome.runtime.id) ||
    message?.type !== "API"
  )
    return;
  void request(message.payload)
    .then(async (result) => {
      await chrome.storage.local.set({
        lastResult: {
          requestId: message.payload.requestId,
          operation: message.payload.operation,
          result,
          at: Date.now(),
        },
      });
      reply(result);
    })
    .catch((e) =>
      reply({
        success: false,
        status: "SERVER_ERROR",
        error: { code: "INTERNAL", message: (e as Error).message },
      }),
    );
  return true;
});
