import type { ApiRequest, ApiResponse } from "../shared/types";
export function parseResponse(value: unknown): ApiResponse {
  const r = value as ApiResponse;
  if (
    !r ||
    typeof r.success !== "boolean" ||
    ![
      "ADDED",
      "UPDATED",
      "SKIPPED",
      "DUPLICATE_FOUND",
      "VALIDATION_ERROR",
      "CONFIGURATION_ERROR",
      "NETWORK_ERROR",
      "SERVER_ERROR",
    ].includes(r.status)
  )
    throw Error(
      "Invalid backend response. Check deployment URL and access settings.",
    );
  if (
    r.status === "DUPLICATE_FOUND" &&
    (!Array.isArray(r.data?.candidates) || !r.data.candidates.length)
  )
    throw Error("Invalid duplicate response.");
  return r;
}
export function validEndpoint(s: string) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(s);
}
export async function request(payload: ApiRequest): Promise<ApiResponse> {
  const { endpoint } = await chrome.storage.local.get("endpoint");
  const { secret } = await chrome.storage.session.get("secret");
  if (
    !validEndpoint(endpoint ?? "") ||
    typeof secret !== "string" ||
    secret.length < 32
  )
    return {
      success: false,
      status: "CONFIGURATION_ERROR",
      error: {
        code: "SETUP",
        message:
          "Open Settings: configure deployment URL and enter a session key (32+ characters).",
      },
    };
  const body = JSON.stringify(payload),
    timestamp = Date.now(),
    nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${timestamp}\n${nonce}\n${body}`),
      ),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ timestamp, nonce, body, signature }),
      redirect: "follow",
      credentials: "omit",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      throw Error(
        `HTTP ${response.status}. Check deployment permissions or quota.`,
      );
    return parseResponse(await response.json());
  } catch (e) {
    return {
      success: false,
      status: "NETWORK_ERROR",
      error: {
        code: "TRANSPORT",
        message: `${(e as Error).message} Save outcome may be unknown; retry the same draft safely.`,
      },
    };
  }
}
