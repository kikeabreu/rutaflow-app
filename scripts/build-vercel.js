const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const result = spawnSync(process.execPath, [path.join(__dirname, "build.js")], {
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

// Vercel serves index.html before rewrites. Remove that collision so the apex
// can serve the landing, while app.ruleto.mx still serves the complete PWA.
fs.renameSync(path.join(__dirname, "..", "build", "index.html"), path.join(__dirname, "..", "build", "app.html"));

const serviceWorkerPath = path.join(__dirname, "..", "build", "sw.js");
const serviceWorker = fs.readFileSync(serviceWorkerPath, "utf8")
  .replace('const VERSION = "ruleto-v1";', 'const VERSION = "ruleto-v2";')
  .replaceAll('"/index.html"', '"/app.html"');
fs.writeFileSync(serviceWorkerPath, serviceWorker);
