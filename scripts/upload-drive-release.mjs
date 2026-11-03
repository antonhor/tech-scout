import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";
import console from "node:console";
import { google } from "googleapis";
import { validateRelease } from "./extension-release.mjs";
import { uploadRelease } from "./drive-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const configPath = resolve(root, ".drive-release.json");
  const config = JSON.parse(
    await readFile(configPath, "utf8").catch(() => {
      throw Error(
        "Create .drive-release.json from .drive-release.json.example and set the target folderId.",
      );
    }),
  );
  const manifest = JSON.parse(
    await readFile(resolve(root, "dist/manifest.json"), "utf8"),
  );
  const archive = resolve(
    root,
    "releases",
    `techscout-extension-${manifest.version}.zip`,
  );
  const bytes = await validateRelease(archive);
  const require = createRequire(import.meta.url);
  const claspEntry = require.resolve("@google/clasp");
  // Use clasp's pinned-version credential loader, including its token refresh
  // handling. Tokens are never copied into project configuration or logs.
  const { initAuth } = await import(
    pathToFileURL(resolve(dirname(claspEntry), "auth/auth.js")).href
  );
  const { credentials } = await initAuth({
    userKey: config.authProfile ?? "techscout-drive",
  });
  if (!credentials)
    throw Error(
      "Authorize the Google account for the release folder first: npm run drive:login.",
    );
  const result = await uploadRelease(
    google.drive({ version: "v3", auth: credentials }),
    config,
    bytes,
    { check: process.argv.includes("--check") },
  );
  if (result.checked)
    console.log(
      "Drive folder access checked. No file uploaded or permissions changed.",
    );
  else {
    await writeFile(
      configPath,
      JSON.stringify({ ...config, fileId: result.fileId }, null, 2) + "\n",
    );
    console.log(
      `${result.updated ? "Updated" : "Uploaded"} extension ZIP: ${result.url}`,
    );
  }
} catch (error) {
  console.error(`Drive upload not completed: ${error.message}`);
  process.exitCode = 1;
}
