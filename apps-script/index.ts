import type {
  Agency,
  ApiRequest,
  ApiResponse,
  Candidate,
} from "../src/shared/types";
import { match } from "../src/shared/duplicates";
import {
  normalizeClutch,
  normalizeDomain,
  normalizeUrl,
  unique,
} from "../src/shared/normalization";
import { validateAgency } from "../src/shared/validation";
const headers = [
  "ID",
  "Company Name",
  "Website",
  "Programming Languages",
  "Frameworks & Technologies",
  "Domain",
  "Clutch URL",
  "Notes",
  "Created At",
  "Updated At",
];
const legacyHeaders = [
  "ID",
  "Company Name",
  "Website",
  "Domain",
  "Clutch URL",
  "Programming Languages",
  "Frameworks & Technologies",
  "Notes",
  "Created At",
  "Updated At",
];
// Zero-based offsets for row values; Range coordinates remain one-based.
const columns = {
  id: 0,
  name: 1,
  website: 2,
  programmingLanguages: 3,
  frameworksAndTechnologies: 4,
  domain: 5,
  clutchUrl: 6,
  notes: 7,
  createdAt: 8,
  updatedAt: 9,
} as const;
// Called only while setup/doPost holds the script lock. A native column move
// preserves cell contents, formulas, formatting and columns outside A:J.
function ensureColumnOrder(s: GoogleAppsScript.Spreadsheet.Sheet) {
  const readHeaders = () => s.getRange(1, 1, 1, headers.length).getValues()[0];
  let actual = readHeaders();
  if (JSON.stringify(actual) === JSON.stringify(legacyHeaders)) {
    s.moveColumns(s.getRange(1, 6, 1, 2), 4);
    SpreadsheetApp.flush();
    actual = readHeaders();
  }
  if (JSON.stringify(actual) !== JSON.stringify(headers))
    throw Error(
      "CONFIGURATION: Companies headers differ. Only the original or updated column order can be migrated automatically; other layouts are left unchanged.",
    );
}
function config() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty("SPREADSHEET_ID"),
    secret = p.getProperty("SIGNING_KEY");
  if (!id || !secret || secret.length < 32)
    throw Error(
      "CONFIGURATION: Set SPREADSHEET_ID and SIGNING_KEY (32+ characters) in Script Properties.",
    );
  return { id, secret };
}
function sheet() {
  const s = SpreadsheetApp.openById(config().id).getSheetByName("Companies");
  if (!s) throw Error("CONFIGURATION: Run setup first.");
  ensureColumnOrder(s);
  return s;
}
export function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(config().id);
    const s = ss.getSheetByName("Companies") ?? ss.insertSheet("Companies");
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, headers.length).setValues([headers]);
      s.setFrozenRows(1);
    } else sheet();
  } finally {
    lock.releaseLock();
  }
}
export const safeCell = (s: string) =>
  /^[\s]*[=+\-@\t\r]/.test(s) ? `'${s}` : s;
function row(a: Agency): (string | number)[] {
  return [
    a.id!,
    a.name,
    a.website,
    a.programmingLanguages.join(", "),
    a.frameworksAndTechnologies.join(", "),
    normalizeDomain(a.website),
    a.clutchUrl,
    a.notes,
    a.createdAt!,
    a.updatedAt!,
  ].map((value) => (typeof value === "string" ? safeCell(value) : value));
}
function decode(r: unknown[]): Agency {
  const s = r.map((v) => String(v ?? ""));
  const rawId = r[columns.id];
  return {
    id: typeof rawId === "number" ? rawId : s[columns.id],
    name: s[columns.name],
    website: s[columns.website],
    clutchUrl: s[columns.clutchUrl],
    programmingLanguages: s[columns.programmingLanguages]
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    frameworksAndTechnologies: s[columns.frameworksAndTechnologies]
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    notes: s[columns.notes],
    createdAt: s[columns.createdAt],
    updatedAt: s[columns.updatedAt],
  };
}
function sameId(a: Agency["id"], b: Agency["id"]): boolean {
  // Accept IDs from cached previews that previously serialized numbers as
  // strings, but always retain the original sheet ID type when writing.
  return a !== undefined && b !== undefined && String(a) === String(b);
}
function digest(s: string) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    s,
    Utilities.Charset.UTF_8,
  )
    .map((v) => (v & 255).toString(16).padStart(2, "0"))
    .join("");
}
function normalized(a: Agency): Agency {
  return {
    ...a,
    name: a.name.trim(),
    website: normalizeUrl(a.website),
    clutchUrl: normalizeClutch(a.clutchUrl),
    programmingLanguages: unique(a.programmingLanguages),
    frameworksAndTechnologies: unique(a.frameworksAndTechnologies),
  };
}
function candidates(
  agency: Agency,
  records: { agency: Agency; token: string }[],
): Candidate[] {
  return records.flatMap((r) => {
    const reason = match(agency, r.agency);
    return reason ? [{ ...r, reason }] : [];
  });
}
function ok(
  status: ApiResponse["status"],
  data?: ApiResponse["data"],
): ApiResponse {
  return { success: true, status, data };
}
function fail(
  status: ApiResponse["status"],
  code: string,
  message: string,
): ApiResponse {
  return { success: false, status, error: { code, message } };
}
function dispatch(p: ApiRequest): ApiResponse {
  const s = sheet();
  if (p.operation === "healthCheck") return ok("SKIPPED");
  if (p.operation === "skip") return ok("SKIPPED");
  if (
    !["checkDuplicate", "createCompany", "updateCompany"].includes(p.operation)
  )
    return fail("VALIDATION_ERROR", "OPERATION", "Unknown operation.");
  const errors = validateAgency(p.agency!);
  if (errors.length)
    return fail("VALIDATION_ERROR", "AGENCY", errors.join(" "));
  const agency = normalized(p.agency!);
  const values =
    s.getLastRow() > 1
      ? s.getRange(2, 1, s.getLastRow() - 1, headers.length).getValues()
      : [];
  const records = values
    .map((r, i) => ({
      agency: decode(r),
      token: digest(JSON.stringify(r)),
      row: i + 2,
    }))
    .filter((r) => r.agency.id !== undefined && r.agency.id !== "");
  if (
    values.some(
      (r) => r.some((v) => v !== "") && String(r[columns.id] ?? "") === "",
    ) ||
    new Set(records.map((r) => String(r.agency.id))).size !== records.length
  )
    return fail(
      "CONFIGURATION_ERROR",
      "SHEET_IDS",
      "Companies contains a missing or duplicate ID. Back up and repair the sheet before saving.",
    );
  const matches = candidates(agency, records);
  if (p.operation === "checkDuplicate")
    return matches.length
      ? ok("DUPLICATE_FOUND", { candidates: matches })
      : ok("SKIPPED");
  if (p.operation === "createCompany") {
    // Request UUID becomes the row ID: retries remain safe without a cache lifetime.
    const existing = records.find((r) => r.agency.id === p.requestId);
    if (existing) {
      const comparable = (a: Agency) =>
        JSON.stringify([
          a.name,
          a.website,
          a.clutchUrl,
          a.programmingLanguages,
          a.frameworksAndTechnologies,
          a.notes,
        ]);
      if (comparable(existing.agency) !== comparable(agency))
        return fail(
          "VALIDATION_ERROR",
          "REQUEST_REUSED",
          "This draft was already saved with other values. Scan again for a new operation.",
        );
      return ok("ADDED", { agency: existing.agency });
    }
    if (matches.length) return ok("DUPLICATE_FOUND", { candidates: matches });
    const now = new Date().toISOString();
    const added = {
      ...agency,
      id: p.requestId,
      createdAt: now,
      updatedAt: now,
    };
    s.getRange(Math.max(2, s.getLastRow() + 1), 1, 1, headers.length).setValues(
      [row(added)],
    );
    SpreadsheetApp.flush();
    return ok("ADDED", { agency: added });
  }
  const targets = records.filter((r) => sameId(r.agency.id, p.id));
  if (targets.length !== 1)
    return fail(
      "VALIDATION_ERROR",
      "TARGET",
      "Target ID is missing or ambiguous. Scan again.",
    );
  const target = targets[0];
  if (target.token !== p.token)
    return fail(
      "VALIDATION_ERROR",
      "CONCURRENT_MODIFICATION",
      "The existing row changed. Cancel and check duplicates again.",
    );
  if (!matches.some((c) => sameId(c.agency.id, p.id)))
    return fail(
      "VALIDATION_ERROR",
      "MATCH_CHANGED",
      "The edited values no longer match the selected record. Cancel and check again.",
    );
  const conflicts = matches.filter((c) => !sameId(c.agency.id, p.id));
  if (conflicts.length) return ok("DUPLICATE_FOUND", { candidates: matches });
  const updated = {
    ...agency,
    id: target.agency.id,
    createdAt: target.agency.createdAt,
    updatedAt: new Date().toISOString(),
  };
  s.getRange(target.row, 1, 1, headers.length).setValues([row(updated)]);
  SpreadsheetApp.flush();
  return ok("UPDATED", { agency: updated });
}
function json(r: ApiResponse) {
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
export function doGet() {
  return json(
    fail("CONFIGURATION_ERROR", "AUTH_REQUIRED", "Use signed POST requests."),
  );
}
export function doPost(e: GoogleAppsScript.Events.DoPost) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    const raw = e.postData?.contents;
    if (!raw || raw.length > 100000)
      return json(
        fail("VALIDATION_ERROR", "PAYLOAD", "Request is missing or too large."),
      );
    const envelope = JSON.parse(raw);
    const { secret } = config();
    if (
      !Number.isSafeInteger(envelope.timestamp) ||
      Math.abs(Date.now() - envelope.timestamp) > 120000 ||
      !/^[-\w]{36}$/.test(envelope.nonce) ||
      typeof envelope.body !== "string" ||
      !/^[a-f0-9]{64}$/.test(envelope.signature)
    )
      throw Error("AUTH: Invalid or expired signature.");
    const expected = Utilities.computeHmacSha256Signature(
      `${envelope.timestamp}\n${envelope.nonce}\n${envelope.body}`,
      secret,
      Utilities.Charset.UTF_8,
    )
      .map((v) => (v & 255).toString(16).padStart(2, "0"))
      .join("");
    let mismatch = 0;
    for (let i = 0; i < 64; i++)
      mismatch |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (mismatch) throw Error("AUTH: Signature rejected.");
    const p = JSON.parse(envelope.body) as ApiRequest;
    if (!/^[0-9a-f-]{36}$/i.test(p.requestId))
      throw Error("Invalid request ID.");
    lock.waitLock(20000);
    acquired = true;
    const cache = CacheService.getScriptCache();
    if (cache.get(`nonce:${envelope.nonce}`))
      throw Error("AUTH: Request replay rejected.");
    cache.put(`nonce:${envelope.nonce}`, "1", 240);
    return json(dispatch(p));
  } catch (e) {
    const message = (e as Error).message;
    return json(
      fail(
        /CONFIGURATION|AUTH/.test(message)
          ? "CONFIGURATION_ERROR"
          : "SERVER_ERROR",
        message.startsWith("AUTH") ? "AUTHENTICATION" : "BACKEND",
        message,
      ),
    );
  } finally {
    if (acquired) lock.releaseLock();
  }
}
