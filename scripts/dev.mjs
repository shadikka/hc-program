import { context } from "esbuild";
import { createServer } from "node:http";
import { cp, readFile, rm, watch } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");
const port = 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Full clean copy up front; incremental re-syncs below only overwrite, so
// they never clobber the app.js/sw.js that esbuild's watch mode writes here.
await rm(distDir, { recursive: true, force: true });
await cp(publicDir, distDir, { recursive: true });

const appCtx = await context({
  entryPoints: [path.join(root, "src/app.ts")],
  bundle: true,
  format: "esm",
  sourcemap: true,
  outfile: path.join(distDir, "app.js"),
});
const swCtx = await context({
  entryPoints: [path.join(root, "sw.ts")],
  bundle: true,
  format: "iife",
  sourcemap: true,
  outfile: path.join(distDir, "sw.js"),
});

await appCtx.watch();
await swCtx.watch();

(async () => {
  const watcher = watch(publicDir, { recursive: true });
  for await (const _event of watcher) {
    await cp(publicDir, distDir, { recursive: true, force: true }).catch((error) => {
      console.error("public/ sync failed", error);
    });
  }
})();

createServer(async (req, res) => {
  try {
    let reqPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    if (reqPath === "/") reqPath = "/index.html";
    const filePath = path.join(distDir, reqPath);
    if (!filePath.startsWith(distDir + path.sep)) throw new Error("forbidden path");
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});
