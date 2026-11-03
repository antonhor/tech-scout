import { createHash } from "node:crypto";
import { Readable } from "node:stream";

const fields =
  "id,name,parents,mimeType,md5Checksum,webViewLink,appProperties,capabilities,trashed";
const marker = { techscoutRelease: "chrome-extension" };
export async function uploadRelease(
  drive,
  config,
  bytes,
  { check = false } = {},
) {
  if (!/^[\w-]{10,}$/.test(config.folderId ?? ""))
    throw Error("Set folderId in the local .drive-release.json file.");
  const folder = (
    await drive.files.get({
      fileId: config.folderId,
      fields,
      supportsAllDrives: true,
    })
  ).data;
  if (
    folder.trashed ||
    folder.mimeType !== "application/vnd.google-apps.folder" ||
    folder.capabilities?.canAddChildren !== true
  )
    throw Error(
      "The configured Drive folder is not accessible for uploads by this Google account.",
    );
  const found = (
    await drive.files.list({
      q: `'${config.folderId}' in parents and trashed = false and appProperties has { key='techscoutRelease' and value='chrome-extension' }`,
      fields: "files(" + fields + "),nextPageToken",
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
  ).data;
  if (found.nextPageToken || (found.files?.length ?? 0) > 1)
    throw Error(
      "Several release files exist in this folder; choose the intended file before updating.",
    );
  const existing = found.files?.[0];
  if (config.fileId && existing?.id !== config.fileId)
    throw Error(
      "The saved release file no longer matches this folder. No upload performed.",
    );
  if (
    existing &&
    (existing.mimeType !== "application/zip" ||
      existing.capabilities?.canEdit !== true ||
      !existing.parents?.includes(config.folderId) ||
      existing.appProperties?.techscoutRelease !== "chrome-extension")
  )
    throw Error(
      "The existing release is not an editable ZIP owned by this upload workflow in the configured folder.",
    );
  if (check)
    return { checked: true, folderId: folder.id, fileId: existing?.id };
  const md5 = createHash("md5").update(bytes).digest("hex");
  const media = { mimeType: "application/zip", body: Readable.from([bytes]) };
  const result = existing
    ? await drive.files.update({
        fileId: existing.id,
        media,
        fields,
        supportsAllDrives: true,
      })
    : await drive.files.create({
        requestBody: {
          name: "TechScout-extension.zip",
          mimeType: "application/zip",
          parents: [config.folderId],
          appProperties: marker,
        },
        media,
        fields,
        supportsAllDrives: true,
      });
  if (!result.data.id || result.data.md5Checksum !== md5)
    throw Error(
      "Drive did not confirm the uploaded ZIP checksum. Check the remote file before retrying.",
    );
  return {
    fileId: result.data.id,
    url:
      result.data.webViewLink ??
      `https://drive.google.com/file/d/${result.data.id}/view`,
    updated: !!existing,
  };
}
