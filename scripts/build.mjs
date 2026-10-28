import { build } from "esbuild";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
await build({
  entryPoints: ["src/content/contentScript.ts"],
  outfile: "dist/content.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
});
await mkdir("dist/apps-script", { recursive: true });
await build({
  entryPoints: ["apps-script/index.ts"],
  outfile: "dist/apps-script/Code.js",
  bundle: true,
  format: "iife",
  globalName: "Collector",
  target: "es2020",
});
const { appendFile } = await import("node:fs/promises");
await appendFile(
  "dist/apps-script/Code.js",
  "\nfunction doPost(e){return Collector.doPost(e)}\nfunction doGet(){return Collector.doGet()}\nfunction setup(){return Collector.setup()}\n",
);
await copyFile(
  "apps-script/appsscript.json",
  "dist/apps-script/appsscript.json",
);
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Clutch Collector",
      version: "1.0.0",
      minimum_chrome_version: "120",
      permissions: ["activeTab", "scripting", "storage"],
      host_permissions: [
        "https://script.google.com/*",
        "https://script.googleusercontent.com/*",
      ],
      action: { default_popup: "src/popup/index.html" },
      options_page: "src/options/index.html",
      background: { service_worker: "background.js", type: "module" },
    },
    null,
    2,
  ),
);
