import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import process from "node:process";
import console from "node:console";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const project = JSON.parse(
    await readFile(resolve(root, ".clasp.json"), "utf8"),
  );
  const directory = resolve(root, ".drive-auth");
  await mkdir(directory, { recursive: true });
  const config = resolve(directory, ".clasp.json");
  await writeFile(
    config,
    JSON.stringify({ scriptId: project.scriptId, rootDir: "." }, null, 2) +
      "\n",
  );
  await writeFile(
    resolve(directory, "appsscript.json"),
    JSON.stringify(
      {
        runtimeVersion: "V8",
        oauthScopes: [
          "https://www.googleapis.com/auth/drive.file",
          "https://www.googleapis.com/auth/drive.metadata.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      require.resolve("@google/clasp"),
      "--user",
      "techscout-drive",
      "--project",
      config,
      "login",
      "--use-project-scopes",
    ],
    { cwd: root, stdio: "inherit" },
  );
  child.on("error", (error) => {
    console.error(`Google Drive login not completed: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(`Google Drive login not started: ${error.message}`);
  process.exitCode = 1;
}
