import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

await rm(distDir, { recursive: true, force: true });
await cp(publicDir, distDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/app.ts")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: path.join(distDir, "app.js"),
});

await build({
  entryPoints: [path.join(root, "sw.ts")],
  bundle: true,
  format: "iife",
  minify: true,
  outfile: path.join(distDir, "sw.js"),
});

console.log(`Built to ${path.relative(root, distDir)}/`);
