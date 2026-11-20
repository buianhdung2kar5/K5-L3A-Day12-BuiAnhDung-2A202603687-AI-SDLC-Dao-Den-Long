import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist/web", { recursive: true });
await build({
  entryPoints: ["src/web/main.ts"],
  bundle: true,
  minify: true,
  platform: "browser",
  target: "es2020",
  outfile: "dist/web/main.js",
  logLevel: "warning",
});
copyFileSync("src/web/index.html", "dist/web/index.html");
console.log("web build -> dist/web");
