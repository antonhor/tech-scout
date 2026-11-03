interface DriveFile {
  id?: string;
  name?: string;
  parents?: string[];
  mimeType?: string;
  md5Checksum?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
  capabilities?: { canAddChildren?: boolean; canEdit?: boolean };
  trashed?: boolean;
}
interface DriveClient {
  files: {
    get(request: Record<string, unknown>): Promise<{ data: DriveFile }>;
    list(
      request: Record<string, unknown>,
    ): Promise<{ data: { files?: DriveFile[]; nextPageToken?: string } }>;
    create(request: Record<string, unknown>): Promise<{ data: DriveFile }>;
    update(request: Record<string, unknown>): Promise<{ data: DriveFile }>;
  };
}
export function uploadRelease(
  drive: DriveClient,
  config: { folderId: string; fileId?: string },
  bytes: Uint8Array,
  options?: { check?: boolean },
): Promise<
  | { checked: true; folderId?: string; fileId?: string }
  | { fileId: string; url: string; updated: boolean }
>;
