import type { ApiRequest, ApiResponse } from "../shared/types";
import { parseResponse } from "./appsScriptClient";
export async function callApi(payload: ApiRequest): Promise<ApiResponse> {
  const response: unknown = await chrome.runtime.sendMessage({
    type: "API",
    payload,
  });
  if (response === undefined)
    throw Error(
      "The extension background worker did not respond. Open chrome://extensions, reload Clutch Collector, then close and reopen its Settings.",
    );
  return parseResponse(response);
}
