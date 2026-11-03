export interface ExtensionRelease {
  path: string;
  version: string;
  entries: string[];
  size: number;
}
export function packageExtension(root: string): Promise<ExtensionRelease>;
export function validateRelease(path: string): Promise<Uint8Array>;
