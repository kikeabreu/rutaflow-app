const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("la descarga estable apunta a la versión Android del proyecto", () => {
  const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
  const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  assert.ok(version, "Falta versionName en Android");

  const routes = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const download = routes.redirects.find(route => route.source === "/android/ruleto-drive.apk");
  assert.equal(
    download?.destination,
    `https://github.com/kikeabreu/rutaflow-app/releases/download/v${version}/Ruleto-Drive-${version}.apk`
  );

  const page = fs.readFileSync(path.join(root, "public/descargar.html"), "utf8");
  assert.match(page, /href="\/android\/ruleto-drive\.apk"/);
});
