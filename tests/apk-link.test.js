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
  const destination = new URL(download?.destination);
  assert.equal(
    `${destination.origin}${destination.pathname}`,
    `https://github.com/kikeabreu/rutaflow-app/releases/download/v${version}/Ruleto-Drive-${version}.apk`
  );

  const page = fs.readFileSync(path.join(root, "public/descargar.html"), "utf8");
  assert.match(page, /href="\/android\/ruleto-drive\.apk"/);
});

// El aviso "Nueva versión disponible" sale de este archivo cuando nadie publicó
// la versión en el panel. Si se queda atrás, los conductores nunca se enteran.
test("el aviso de respaldo anuncia la misma versión Android del proyecto", () => {
  const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
  const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);

  const release = JSON.parse(fs.readFileSync(path.join(root, "public/android-release.json"), "utf8"));
  assert.equal(release.version_label, version);
  assert.equal(release.build_number, code);
  assert.ok(Number.isSafeInteger(release.minimum_build) && release.minimum_build <= code);
  assert.equal(release.artifact_url, `https://github.com/kikeabreu/rutaflow-app/releases/download/v${version}/Ruleto-Drive-${version}.apk`);
});
