import { toASCII } from "punycode/";
// Apps Script V8 does not provide the browser URL global.
export function parseHttp(input: string) {
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(?:#.*)?$/i.exec(input);
  if (!m || /[\s\\]/.test(input) || m[2].includes("@"))
    throw Error("Use a valid HTTP(S) URL without credentials.");
  const parts = /^([^:]+)(?::(\d{1,5}))?$/.exec(m[2].toLowerCase());
  if (!parts) throw Error("Invalid website host.");
  const hostname = toASCII(parts[1]);
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
      hostname,
    ) ||
    Number(parts[2] ?? 0) > 65535
  )
    throw Error("Invalid website host.");
  const protocol = m[1].toLowerCase() + ":";
  const port =
    parts[2] &&
    !(
      (protocol === "https:" && parts[2] === "443") ||
      (protocol === "http:" && parts[2] === "80")
    )
      ? ":" + parts[2]
      : "";
  return {
    protocol,
    hostname,
    port,
    pathname: m[3] || "/",
    search: m[4] ?? "",
  };
}
