import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { packageExtension } from "./extension-release.mjs";

try {
  const result = await packageExtension(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  console.log(
    `Extension ZIP ready: ${result.path} (${result.size} bytes, ${result.entries.length} files).`,
  );
} catch (error) {
  console.error(`Extension ZIP not created: ${error.message}`);
  process.exitCode = 1;
}
