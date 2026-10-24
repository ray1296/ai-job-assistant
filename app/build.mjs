import { build } from "esbuild";
import fs from "node:fs/promises";
const output = process.env.BUILD_OUT_DIR || "dist";
await fs.mkdir(`${output}/assets`, { recursive: true });
import { parse, compileScript, compileTemplate, compileStyle } from "@vue/compiler-sfc";
import path from "node:path";

// 支持 .vue 单文件组件（为了直接复用原项目的页面）
const vuePlugin = {
  name: "vue",
  setup(build) {
    build.onResolve({ filter: /\.vue$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: "vue",
    }));
    build.onLoad({ filter: /.*/, namespace: "vue" }, async (args) => {
      const source = await fs.readFile(args.path, "utf8");
      const { descriptor } = parse(source, { filename: args.path });
      const id = Buffer.from(args.path).toString("base64").slice(0, 8);
      // 编译 <style>（scoped/普通）并注入到页面，SFC 样式才不会丢
      const styles = (descriptor.styles || []).map((st) => {
        try {
          const r = compileStyle({ source: st.content, filename: args.path, id: "data-v-" + id, scoped: !!st.scoped });
          return r.code;
        } catch { return ""; }
      }).join("\n");
      const inject = styles
        ? "\n;(function(){if(typeof document===\"undefined\")return;var s=document.createElement(\"style\");s.setAttribute(\"data-vue-sfc\",\"" + id + "\");s.textContent=" + JSON.stringify(styles) + ";document.head.appendChild(s);})();\n"
        : "";
      if (!descriptor.script && !descriptor.scriptSetup) {
        const tpl = compileTemplate({ source: descriptor.template?.content || "", filename: args.path, id, compilerOptions: { mode: "module" } });
        return { contents: tpl.code + "\nexport default { render: render };" + inject, loader: "ts", resolveDir: path.dirname(args.path) };
      }
      const script = compileScript(descriptor, { id, inlineTemplate: true, templateOptions: { compilerOptions: { mode: "module" } } });
      return { contents: script.content + inject, loader: "ts", resolveDir: path.dirname(args.path) };
    });
  },
};

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: `${output}/assets`,
  entryNames: "main",
  chunkNames: "[name]-[hash]",
  minify: true,
  sourcemap: false,
  plugins: [vuePlugin],
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".css": "css" },
  define: {
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
});
// 第二入口：原项目外壳（题库页单独跑在 /orig/）
await build({
  entryPoints: ["src/orig-shell/main.ts"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: `${output}/orig/assets`,
  entryNames: "main",
  chunkNames: "[name]-[hash]",
  minify: true,
  plugins: [vuePlugin],
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".css": "css" },
});
await fs.copyFile("src/orig-shell/index.html", `${output}/orig/index.html`);

await fs.copyFile("src/app.css", `${output}/assets/app.css`);
await fs.copyFile("src/resume-studio.css", `${output}/assets/resume-studio.css`);
await fs.copyFile("src/proto.css", `${output}/assets/proto.css`);
await fs.copyFile("src/proto-extra.css", `${output}/assets/proto-extra.css`);
await fs.copyFile("src/china.json", `${output}/assets/china.json`);
await fs.copyFile("src/tagcanvas.min.js", `${output}/assets/tagcanvas.min.js`);
await fs.copyFile("src/orig/themes.css", `${output}/assets/orig-themes.css`);
await fs.copyFile("src/orig/common.css", `${output}/assets/orig-common.css`);
await fs.copyFile("src/index.html", `${output}/index.html`);
// 看板娘立绘
await fs.mkdir(`${output}/assets/companions`, { recursive: true });
for (const f of await fs.readdir("public/assets/companions"))
  await fs.copyFile("public/assets/companions/" + f, `${output}/assets/companions/` + f);
console.log("Built Vue shell with lazy profile/resume modules");
