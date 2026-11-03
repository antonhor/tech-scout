import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";
import {
  packageExtension,
  validateRelease,
} from "../scripts/extension-release.mjs";
import { uploadRelease } from "../scripts/drive-release.mjs";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "techscout-release-"));
  temporary.push(root);
  await mkdir(join(root, "dist", "apps-script"), { recursive: true });
  await mkdir(join(root, "dist", "assets"));
  const files: Record<string, string> = {
    "manifest.json": JSON.stringify({
      manifest_version: 3,
      version: "1.0.0",
      background: { service_worker: "background.js" },
      action: { default_popup: "popup.html" },
      options_page: "options.html",
    }),
    "background.js": "// worker",
    "content.js": "// content",
    "popup.html": "<html></html>",
    "options.html": "<html></html>",
    "assets/ui.css": "body{}",
    "apps-script/Code.js": "private server code",
    "apps-script/appsscript.json": "{}",
    ".env": "SECRET=not-for-release",
    "signing.pem": "private key",
    "worker.js.map": "source map",
  };
  for (const [name, contents] of Object.entries(files))
    await writeFile(join(root, "dist", name), contents);
  return root;
}
describe("installable extension ZIP", () => {
  it("contains the root manifest and runtime files without backend, keys or settings", async () => {
    const root = await fixture(),
      result = await packageExtension(root),
      bytes = await validateRelease(result.path),
      files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      "assets/ui.css",
      "background.js",
      "content.js",
      "manifest.json",
      "options.html",
      "popup.html",
    ]);
    expect(result.version).toBe("1.0.0");
    expect(await readFile(result.path)).toEqual(bytes);
  });
  it("rejects a build missing its content script", async () => {
    const root = await fixture();
    await rm(join(root, "dist", "content.js"));
    await expect(packageExtension(root)).rejects.toThrow("content.js");
  });
  it("rejects backend files in a manually modified release archive", async () => {
    const root = await fixture(),
      result = await packageExtension(root);
    await writeFile(
      result.path,
      zipSync({
        "manifest.json": strToU8("{}"),
        "apps-script/Code.js": strToU8("private"),
      }),
    );
    await expect(validateRelease(result.path)).rejects.toThrow(
      "Unexpected file",
    );
  });
});
const folderId = "test-folder-id",
  fileId = "test-release-file-id",
  bytes = Buffer.from("test archive");
const checksum = createHash("md5").update(bytes).digest("hex");
function client(existing = false) {
  const file = {
    id: fileId,
    mimeType: "application/zip",
    parents: [folderId],
    appProperties: { techscoutRelease: "chrome-extension" },
    capabilities: { canEdit: true },
    md5Checksum: checksum,
    webViewLink: "https://drive.google.com/file/d/test/view",
  };
  const files = {
    get: vi
      .fn()
      .mockResolvedValue({
        data: {
          id: folderId,
          mimeType: "application/vnd.google-apps.folder",
          capabilities: { canAddChildren: true },
        },
      }),
    list: vi
      .fn()
      .mockResolvedValue({ data: { files: existing ? [file] : [] } }),
    create: vi.fn().mockResolvedValue({ data: file }),
    update: vi.fn().mockResolvedValue({ data: file }),
  };
  return { files };
}
describe("Drive release publishing with mocked Google API", () => {
  it("creates a marked ZIP without changing sharing permissions", async () => {
    const drive = client();
    const result = await uploadRelease(drive, { folderId }, bytes);
    expect(result).toMatchObject({ fileId, updated: false });
    expect(drive.files.create).toHaveBeenCalledOnce();
    expect(drive.files.update).not.toHaveBeenCalled();
    expect(drive.files.create.mock.calls[0][0].requestBody).toEqual({
      name: "TechScout-extension.zip",
      mimeType: "application/zip",
      parents: [folderId],
      appProperties: { techscoutRelease: "chrome-extension" },
    });
  });
  it("updates the existing file ID without renaming, moving or changing permissions", async () => {
    const drive = client(true);
    expect(
      await uploadRelease(drive, { folderId, fileId }, bytes),
    ).toMatchObject({ fileId, updated: true });
    const request = drive.files.update.mock.calls[0][0];
    expect(request.fileId).toBe(fileId);
    expect(request.requestBody).toBeUndefined();
    expect(drive.files.create).not.toHaveBeenCalled();
  });
  it("can check folder access without creating or updating a file", async () => {
    const drive = client();
    expect(
      await uploadRelease(drive, { folderId }, bytes, { check: true }),
    ).toMatchObject({ checked: true });
    expect(drive.files.create).not.toHaveBeenCalled();
    expect(drive.files.update).not.toHaveBeenCalled();
  });
  it("refuses to overwrite an unexpected saved file ID", async () => {
    const drive = client(true);
    await expect(
      uploadRelease(drive, { folderId, fileId: "different-id" }, bytes),
    ).rejects.toThrow("no longer matches");
    expect(drive.files.update).not.toHaveBeenCalled();
  });
  it("does not claim success if Drive reports a different checksum", async () => {
    const drive = client();
    drive.files.create.mockResolvedValueOnce({
      data: { id: fileId, md5Checksum: "wrong" },
    });
    await expect(uploadRelease(drive, { folderId }, bytes)).rejects.toThrow(
      "checksum",
    );
  });
  it("refuses upload to a folder without write access", async () => {
    const drive = client();
    drive.files.get.mockResolvedValueOnce({
      data: {
        id: folderId,
        mimeType: "application/vnd.google-apps.folder",
        capabilities: { canAddChildren: false },
      },
    });
    await expect(uploadRelease(drive, { folderId }, bytes)).rejects.toThrow(
      "not accessible",
    );
    expect(drive.files.create).not.toHaveBeenCalled();
  });
});
