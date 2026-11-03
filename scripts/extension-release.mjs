import { lstat, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, sep, dirname } from "node:path";
import { zipSync, unzipSync } from "fflate";

const runtimeExtension =
  /\.(?:js|css|html|png|jpe?g|gif|svg|webp|avif|ico|woff2?)$/i;
export async function packageExtension(root) {
  const dist = resolve(root, "dist");
  const manifest = JSON.parse(
    await readFile(resolve(dist, "manifest.json"), "utf8"),
  );
  if (
    manifest.manifest_version !== 3 ||
    !/^\d+(?:\.\d+){0,3}$/.test(manifest.version ?? "")
  )
    throw Error("Build a valid Manifest V3 extension first.");
  const files = {};
  async function collect(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = resolve(dir, item.name),
        name = relative(dist, full).split(sep).join("/");
      if (item.isSymbolicLink())
        throw Error(`Release cannot contain symlinks: ${name}`);
      if (name === "apps-script" || name.startsWith("apps-script/")) continue;
      if (item.isDirectory()) {
        await collect(full);
        continue;
      }
      if (name !== "manifest.json" && !runtimeExtension.test(name)) continue;
      files[name] = new Uint8Array(await readFile(full));
    }
  }
  await collect(dist);
  for (const path of [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    "content.js",
  ]) {
    if (!path || !Object.hasOwn(files, path))
      throw Error(`Release is missing a required extension file: ${path}`);
  }
  const output = resolve(
    root,
    "releases",
    `techscout-extension-${manifest.version}.zip`,
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, zipSync(files, { level: 6 }));
  return {
    path: output,
    version: manifest.version,
    entries: Object.keys(files),
    size: (await lstat(output)).size,
  };
}
export async function validateRelease(path) {
  const bytes = await readFile(path),
    files = unzipSync(bytes);
  for (const name of Object.keys(files)) {
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.startsWith("apps-script/") ||
      (name !== "manifest.json" && !runtimeExtension.test(name))
    )
      throw Error(`Unexpected file in extension release: ${name}`);
  }
  if (!files["manifest.json"])
    throw Error("Release has no root manifest.json.");
  return bytes;
}
