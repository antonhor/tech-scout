import { beforeEach, describe, it, expect, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { doPost, setup } from "../apps-script/index";
import type { ApiRequest, ApiResponse } from "../src/shared/types";
const secret = "a".repeat(64);
let rows: unknown[][], locked: boolean, cache: Map<string, string>;
let sequence = 0;
let moves = 0;
const updatedHeaders = [
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
const originalHeaders = [
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
function originalRow() {
  return [
    "legacy-id",
    "Example",
    "https://example.com",
    "example.com",
    "https://clutch.co/profile/example",
    "Python, Java",
    "Django, Spring",
    "Existing notes",
    "2025-01-01T00:00:00.000Z",
    "2025-02-01T00:00:00.000Z",
  ];
}
const range = (r: number, c: number, n: number, m: number) => ({
  getColumn: () => c,
  getNumColumns: () => m,
  getValues: () =>
    Array.from({ length: n }, (_, i) =>
      Array.from({ length: m }, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? ""),
    ),
  setValues: (values: unknown[][]) => {
    expect(locked).toBe(true);
    values.forEach((value, i) => {
      rows[r + i - 1] ??= [];
      value.forEach((v, j) => {
        rows[r + i - 1][c + j - 1] = v;
      });
    });
  },
});
beforeEach(() => {
  rows = [];
  locked = false;
  cache = new Map();
  moves = 0;
  const sheet = {
    getLastRow: () => rows.length,
    getRange: range,
    setFrozenRows: vi.fn(),
    moveColumns: vi.fn(
      (source: ReturnType<typeof range>, destination: number) => {
        expect(locked).toBe(true);
        moves++;
        const start = source.getColumn() - 1,
          count = source.getNumColumns();
        for (const row of rows) {
          const moved = row.splice(start, count);
          row.splice(
            destination - 1 - (destination > start + 1 ? count : 0),
            0,
            ...moved,
          );
        }
      },
    ),
  };
  vi.stubGlobal("PropertiesService", {
    getScriptProperties: () => ({
      getProperty: (key: string) =>
        key === "SPREADSHEET_ID" ? "sheet-id" : secret,
    }),
  });
  vi.stubGlobal("SpreadsheetApp", {
    openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
    flush: vi.fn(),
  });
  vi.stubGlobal("LockService", {
    getScriptLock: () => ({
      waitLock: () => {
        expect(locked).toBe(false);
        locked = true;
      },
      releaseLock: () => {
        locked = false;
      },
    }),
  });
  vi.stubGlobal("CacheService", {
    getScriptCache: () => ({
      get: (k: string) => cache.get(k),
      put: (k: string, v: string) => cache.set(k, v),
    }),
  });
  vi.stubGlobal("Utilities", {
    DigestAlgorithm: { SHA_256: "sha256" },
    Charset: { UTF_8: "utf8" },
    computeDigest: (_algorithm: string, value: string) => [
      ...createHash("sha256").update(value).digest(),
    ],
    computeHmacSha256Signature: (value: string, key: string) => [
      ...createHmac("sha256", key).update(value).digest(),
    ],
  });
  vi.stubGlobal("ContentService", {
    MimeType: { JSON: "json" },
    createTextOutput: (value: string) => ({
      setMimeType: () => JSON.parse(value),
    }),
  });
  setup();
});
const agency = {
  name: "Example",
  website: "https://example.com",
  clutchUrl: "https://clutch.co/profile/example",
  programmingLanguages: ["Python"],
  frameworksAndTechnologies: ["Django"],
  notes: "",
};
const uuid = () =>
  `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
function envelope(p: Partial<ApiRequest>) {
  const body = JSON.stringify({ requestId: uuid(), ...p }),
    timestamp = Date.now(),
    nonce = uuid();
  return {
    body,
    timestamp,
    nonce,
    signature: createHmac("sha256", secret)
      .update(`${timestamp}\n${nonce}\n${body}`)
      .digest("hex"),
  };
}
function send(p: Partial<ApiRequest>) {
  return post(envelope(p));
}
function post(e: ReturnType<typeof envelope>) {
  return doPost({
    postData: { contents: JSON.stringify(e) },
  } as GoogleAppsScript.Events.DoPost) as unknown as ApiResponse;
}

function importedRows() {
  return Array.from({ length: 125 }, (_, i) => [
    i + 1,
    `Imported company ${i + 1}`,
    `https://legacy${i + 1}.example`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
}

describe("manually imported companies with numeric IDs and incomplete URLs", () => {
  it("checks and appends a genuinely new company after 125 legacy rows without rewriting them", () => {
    rows.push(...importedRows());
    const before = structuredClone(rows);
    const requestId = uuid();
    expect(
      send({ operation: "checkDuplicate", agency, requestId }).status,
    ).toBe("SKIPPED");
    expect(rows).toEqual(before);
    expect(send({ operation: "createCompany", agency, requestId }).status).toBe(
      "ADDED",
    );
    expect(rows).toHaveLength(127);
    expect(rows.slice(0, 126)).toEqual(before);
    expect(rows[126][0]).toBe(requestId);
    expect(moves).toBe(0);
    expect(send({ operation: "createCompany", agency, requestId }).status).toBe(
      "ADDED",
    );
    expect(rows).toHaveLength(127);
  });
  it("detects UUID records among partial numeric records and preserves both ID types", () => {
    rows.push(...importedRows());
    const saved = send({ operation: "createCompany", agency }).data!.agency!;
    const before = structuredClone(rows);
    const uuidMatch = send({ operation: "checkDuplicate", agency }).data!
      .candidates![0];
    expect(uuidMatch.reason).toBe("clutch");
    expect(uuidMatch.agency.id).toBe(saved.id);
    const numericMatch = send({
      operation: "checkDuplicate",
      agency: { ...agency, website: "https://www.legacy75.example/about" },
    }).data!.candidates![0];
    expect(numericMatch.reason).toBe("domain");
    expect(numericMatch.agency.id).toBe(75);
    expect(rows).toEqual(before);
  });
  it("requires duplicate confirmation for website matches with blank Domain and Clutch URL cells", () => {
    rows.push(...importedRows());
    const before = structuredClone(rows);
    const proposed = {
      ...agency,
      website: "http://www.legacy10.example/about?utm_source=clutch",
    };
    const result = send({ operation: "createCompany", agency: proposed });
    expect(result.status).toBe("DUPLICATE_FOUND");
    expect(result.data!.candidates![0]).toMatchObject({
      reason: "domain",
      agency: { id: 10, clutchUrl: "" },
    });
    expect(rows).toEqual(before);
    expect(send({ operation: "skip" }).status).toBe("SKIPPED");
    expect(rows).toEqual(before);
  });
  it("returns a possible name-only duplicate when existing URLs are unusable", () => {
    rows.push([
      7,
      "  EXAMPLE   ",
      "broken website",
      "",
      "",
      "",
      "not a profile",
      "",
      "",
      "",
    ]);
    const before = structuredClone(rows);
    const result = send({ operation: "checkDuplicate", agency });
    expect(result.status).toBe("DUPLICATE_FOUND");
    expect(result.data!.candidates![0]).toMatchObject({
      reason: "name",
      agency: { id: 7 },
    });
    expect(rows).toEqual(before);
  });
  it("ignores malformed URL keys rather than aborting unrelated inserts", () => {
    rows.push([
      1,
      "Unrelated",
      "not a website",
      "",
      "",
      "",
      "bad profile",
      "",
      "",
      "",
    ]);
    const before = structuredClone(rows);
    expect(send({ operation: "createCompany", agency }).status).toBe("ADDED");
    expect(rows.slice(0, 2)).toEqual(before);
  });
  it.each([75, "75"])(
    "updates a confirmed legacy duplicate without converting its numeric ID (request ID %j)",
    (id) => {
      rows.push(...importedRows());
      const before = structuredClone(rows);
      const proposed = { ...agency, website: "https://legacy75.example" };
      const candidate = send({ operation: "checkDuplicate", agency: proposed })
        .data!.candidates![0];
      expect(candidate.agency.id).toBe(75);
      const updated = send({
        operation: "updateCompany",
        agency: { ...proposed, notes: "Confirmed update" },
        id,
        token: candidate.token,
      });
      expect(updated.status).toBe("UPDATED");
      expect(updated.data!.agency!.id).toBe(75);
      expect(rows[75][0]).toBe(75);
      expect(rows[75][7]).toBe("Confirmed update");
      expect(rows[75][8]).toBe("");
      expect(rows.filter((_, index) => index !== 75)).toEqual(
        before.filter((_, index) => index !== 75),
      );
    },
  );
  it("updates UUID records with legacy rows above them and keeps concurrency protection", () => {
    const saved = send({ operation: "createCompany", agency }).data!.agency!;
    const candidate = send({ operation: "checkDuplicate", agency }).data!
      .candidates![0];
    rows.splice(1, 0, ...importedRows());
    expect(
      send({
        operation: "updateCompany",
        agency: { ...agency, notes: "Confirmed" },
        id: saved.id,
        token: candidate.token,
      }).status,
    ).toBe("UPDATED");
    expect(rows[126][0]).toBe(saved.id);
    expect(rows[126][8]).toBe(saved.createdAt);
    expect(
      send({
        operation: "updateCompany",
        agency,
        id: saved.id,
        token: candidate.token,
      }).error?.code,
    ).toBe("CONCURRENT_MODIFICATION");
  });
  it.each(["", "not a profile"])(
    "still rejects newly submitted invalid Clutch URLs: %j",
    (clutchUrl) => {
      rows.push(...importedRows());
      const before = structuredClone(rows);
      expect(
        send({ operation: "createCompany", agency: { ...agency, clutchUrl } })
          .status,
      ).toBe("VALIDATION_ERROR");
      expect(rows).toEqual(before);
    },
  );
  it("still rejects newly submitted invalid websites", () => {
    rows.push(...importedRows());
    const before = structuredClone(rows);
    expect(
      send({
        operation: "createCompany",
        agency: { ...agency, website: "broken website" },
      }).status,
    ).toBe("VALIDATION_ERROR");
    expect(rows).toEqual(before);
  });
  it("still rejects numeric/text ID collisions without rewriting IDs", () => {
    rows.push(...importedRows(), [
      "75",
      "Other company",
      "https://other.example",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    const before = structuredClone(rows);
    expect(send({ operation: "createCompany", agency }).error?.code).toBe(
      "SHEET_IDS",
    );
    expect(rows).toEqual(before);
  });
  it.each([0, "0075"])(
    "retains the exact ID value and type on confirmed updates: %j",
    (id) => {
      rows.push([
        id,
        "Existing company",
        agency.website,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      const candidate = send({ operation: "checkDuplicate", agency }).data!
        .candidates![0];
      expect(candidate.agency.id).toBe(id);
      expect(
        send({ operation: "updateCompany", agency, id, token: candidate.token })
          .status,
      ).toBe("UPDATED");
      expect(rows[1][0]).toBe(id);
    },
  );
  it("still rejects populated rows with a missing ID", () => {
    rows.push([
      "",
      "Existing company",
      agency.website,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    const before = structuredClone(rows);
    expect(send({ operation: "createCompany", agency }).error?.code).toBe(
      "SHEET_IDS",
    );
    expect(rows).toEqual(before);
  });
});
describe("Apps Script with in-memory Google service adapters", () => {
  it("creates new sheets with languages in D and technologies in E", () => {
    expect(rows[0]).toEqual(updatedHeaders);
    send({ operation: "createCompany", agency });
    expect(rows[1].slice(1, 8)).toEqual([
      "Example",
      "https://example.com",
      "Python",
      "Django",
      "example.com",
      "https://clutch.co/profile/example",
      "",
    ]);
    expect(moves).toBe(0);
  });
  it("migrates original columns once, preserving rows, blanks, formulas and appended columns", () => {
    const first = originalRow();
    const second = [
      "second-id",
      "Other",
      "https://other.example",
      "other.example",
      "https://clutch.co/profile/other",
      "",
      "React",
      "=SUM(1,2)",
      "2024-01-01",
      "2024-02-01",
    ];
    rows = [
      [...originalHeaders, "Custom"],
      [...first, "custom value"],
      Array(11).fill(""),
      [...second, "=A4"],
    ];
    const expected = rows.map((r) => [
      ...r.slice(0, 3),
      ...r.slice(5, 7),
      ...r.slice(3, 5),
      ...r.slice(7),
    ]);
    setup();
    expect(rows).toEqual(expected);
    expect(moves).toBe(1);
    setup();
    expect(rows).toEqual(expected);
    expect(moves).toBe(1);
  });
  it("migrates a legacy sheet containing only headers", () => {
    rows = [[...originalHeaders]];
    setup();
    expect(rows).toEqual([updatedHeaders]);
    expect(moves).toBe(1);
  });
  it.each(["clutch", "domain", "name"] as const)(
    "migrates before API duplicate matching by %s",
    (reason) => {
      rows = [[...originalHeaders], originalRow()];
      const proposed = {
        ...agency,
        clutchUrl:
          reason === "clutch"
            ? agency.clutchUrl
            : "https://clutch.co/profile/other",
        website:
          reason === "name" ? "https://different.example" : agency.website,
      };
      const result = send({ operation: "checkDuplicate", agency: proposed });
      expect(result.status).toBe("DUPLICATE_FOUND");
      const candidate = result.data!.candidates![0];
      expect(candidate.reason).toBe(reason);
      expect(candidate.agency).toMatchObject({
        id: "legacy-id",
        clutchUrl: agency.clutchUrl,
        programmingLanguages: ["Python", "Java"],
        frameworksAndTechnologies: ["Django", "Spring"],
        notes: "Existing notes",
      });
      expect(moves).toBe(1);
    },
  );
  it("updates migrated records using the new offsets while retaining stable ID and timestamps", () => {
    rows = [[...originalHeaders], originalRow()];
    const candidate = send({ operation: "checkDuplicate", agency }).data!
      .candidates![0];
    const result = send({
      operation: "updateCompany",
      agency: {
        ...agency,
        programmingLanguages: ["Kotlin"],
        frameworksAndTechnologies: ["Spring"],
        notes: "Reviewed",
      },
      id: candidate.agency.id,
      token: candidate.token,
    });
    expect(result.status).toBe("UPDATED");
    expect(rows[1].slice(0, 9)).toEqual([
      "legacy-id",
      "Example",
      "https://example.com",
      "Kotlin",
      "Spring",
      "example.com",
      agency.clutchUrl,
      "Reviewed",
      "2025-01-01T00:00:00.000Z",
    ]);
    expect(rows[1][9]).not.toBe("2025-02-01T00:00:00.000Z");
  });
  it("rejects concurrency tokens issued before a migration", () => {
    const previous = originalRow();
    rows = [[...originalHeaders], previous];
    const token = createHash("sha256")
      .update(JSON.stringify(previous))
      .digest("hex");
    const result = send({
      operation: "updateCompany",
      agency,
      id: "legacy-id",
      token,
    });
    expect(result.error?.code).toBe("CONCURRENT_MODIFICATION");
    expect(rows[1][7]).toBe("Existing notes");
  });
  it("does not alter malformed or partially reordered layouts", () => {
    rows = [[...originalHeaders], originalRow()];
    [rows[0][3], rows[0][5]] = [rows[0][5], rows[0][3]];
    const before = JSON.stringify(rows);
    expect(send({ operation: "createCompany", agency }).status).toBe(
      "CONFIGURATION_ERROR",
    );
    expect(JSON.stringify(rows)).toBe(before);
    expect(moves).toBe(0);
  });
  it("does not write company data when a native move is refused", () => {
    rows = [[...originalHeaders], originalRow()];
    const before = JSON.stringify(rows);
    const sheet =
      SpreadsheetApp.openById("sheet-id").getSheetByName("Companies")!;
    vi.spyOn(sheet, "moveColumns").mockImplementationOnce(() => {
      throw Error("Protected columns");
    });
    expect(send({ operation: "createCompany", agency }).success).toBe(false);
    expect(JSON.stringify(rows)).toBe(before);
    expect(locked).toBe(false);
  });
  it("initializes once without destroying data", () => {
    send({ operation: "createCompany", agency });
    setup();
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("Example");
  });
  it("does not accept unsigned or tampered requests", () => {
    const e = envelope({ operation: "createCompany", agency });
    e.signature = "0".repeat(64);
    expect(post(e).success).toBe(false);
    expect(rows).toHaveLength(1);
  });
  it("rejects expired requests and releases locks", () => {
    const e = envelope({ operation: "healthCheck" });
    e.timestamp -= 180000;
    expect(post(e).success).toBe(false);
    expect(locked).toBe(false);
  });
  it("rejects replayed nonce", () => {
    const e = envelope({ operation: "healthCheck" });
    expect(post(e).success).toBe(true);
    expect(post(e).success).toBe(false);
  });
  it("creates idempotently with a stable ID", () => {
    const id = uuid();
    expect(
      send({ operation: "createCompany", agency, requestId: id }).status,
    ).toBe("ADDED");
    expect(
      send({ operation: "createCompany", agency, requestId: id }).status,
    ).toBe("ADDED");
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe(id);
  });
  it("rechecks duplicate on create even without a prior check", () => {
    send({ operation: "createCompany", agency });
    const r = send({ operation: "createCompany", agency });
    expect(r.status).toBe("DUPLICATE_FOUND");
    expect(rows).toHaveLength(2);
  });
  it("updates by ID with version check and preserves creation date", () => {
    send({ operation: "createCompany", agency });
    const c = send({ operation: "checkDuplicate", agency }).data!
      .candidates![0];
    const created = rows[1][8];
    expect(
      send({
        operation: "updateCompany",
        id: c.agency.id,
        token: c.token,
        agency: { ...agency, notes: "Reviewed" },
      }).status,
    ).toBe("UPDATED");
    expect(rows[1][7]).toBe("Reviewed");
    expect(rows[1][8]).toBe(created);
    expect(rows[1][0]).toBe(c.agency.id);
  });
  it("does not overwrite concurrent spreadsheet edits", () => {
    send({ operation: "createCompany", agency });
    const c = send({ operation: "checkDuplicate", agency }).data!
      .candidates![0];
    rows[1][7] = "Manual edit";
    const r = send({
      operation: "updateCompany",
      id: c.agency.id,
      token: c.token,
      agency,
    });
    expect(r.error?.code).toBe("CONCURRENT_MODIFICATION");
    expect(rows[1][7]).toBe("Manual edit");
  });
  it("does not trust an unrelated ID", () => {
    send({ operation: "createCompany", agency });
    const c = send({ operation: "checkDuplicate", agency }).data!
      .candidates![0];
    expect(
      send({ operation: "updateCompany", id: uuid(), token: c.token, agency })
        .success,
    ).toBe(false);
  });
  it("skip leaves sheet unchanged", () => {
    const before = JSON.stringify(rows);
    expect(send({ operation: "skip" }).status).toBe("SKIPPED");
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("protects against formula injection on writes", () => {
    send({
      operation: "createCompany",
      agency: { ...agency, notes: '=IMPORTXML("evil")' },
    });
    expect(rows[1][7]).toBe('\'=IMPORTXML("evil")');
  });
  it("does not overwrite unexpected headers", () => {
    rows[0][0] = "My custom column";
    expect(() => setup()).toThrow("headers differ");
    expect(rows[0][0]).toBe("My custom column");
  });
});
