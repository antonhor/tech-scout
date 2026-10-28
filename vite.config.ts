import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        popup: "src/popup/index.html",
        options: "src/options/index.html",
        background: "src/background/index.ts",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
