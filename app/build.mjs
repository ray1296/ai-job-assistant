import { build } from "esbuild";
import fs from "node:fs/promises";
await fs.mkdir("dist/assets", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "dist/assets",
  entryNames: "main",
  chunkNames: "[name]-[hash]",
  minify: true,
  sourcemap: false,
  define: {
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
});
await fs.copyFile("src/app.css", "dist/assets/app.css");
await fs.copyFile("src/resume-studio.css", "dist/assets/resume-studio.css");
await fs.copyFile("src/index.html", "dist/index.html");
console.log("Built Vue shell with lazy profile/resume modules");
