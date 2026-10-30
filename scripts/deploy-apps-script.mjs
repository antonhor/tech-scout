import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const project = JSON.parse(
    await readFile(resolve(root, ".clasp.json"), "utf8"),
  );
  const target = JSON.parse(
    await readFile(resolve(root, ".clasp.deploy.json"), "utf8"),
  );
  if (
    target.scriptId !== project.scriptId ||
    !/^[A-Za-z0-9_-]{20,}$/.test(target.deploymentId ?? "")
  ) {
    throw Error(
      "Deployment configuration must identify an existing deployment of the configured Script ID.",
    );
  }
  const args = [
    "--user",
    "techscout",
    "create-deployment",
    "--deploymentId",
    target.deploymentId,
  ];
  if (process.argv.includes("--check")) {
    console.log(
      `Configured existing deployment: ${target.deploymentId}. No changes made.`,
    );
  } else {
    const require = createRequire(import.meta.url);
    const packageFile = require.resolve("@google/clasp/package.json");
    const metadata = JSON.parse(await readFile(packageFile, "utf8"));
    const cli = resolve(dirname(packageFile), metadata.bin.clasp);
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`Apps Script deployment not started: ${error.message}`);
  process.exitCode = 1;
}
