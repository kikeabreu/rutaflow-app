const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");
const fs = require("node:fs");

const localEnv = path.resolve(process.cwd(), ".env.android.local");
dotenv.config({ path: localEnv, override: false });

const gradle = fs.readFileSync(path.resolve(__dirname, "../android/app/build.gradle"), "utf8");
if (!fs.existsSync(path.resolve(__dirname, "../android/app/google-services.json"))) {
  console.error("No se puede crear la APK: falta android/app/google-services.json de Firebase para las notificaciones push.");
  process.exit(1);
}

const env = {
  ...process.env,
  REACT_APP_BUILD_NUMBER: gradle.match(/versionCode\s+(\d+)/)?.[1] || "0",
  REACT_APP_BUILD_LABEL: gradle.match(/versionName\s+"([^"]+)"/)?.[1] || "unknown",
  REACT_APP_BUILD_TARGET: "android",
  REACT_APP_API_BASE_URL:
    process.env.REACT_APP_API_BASE_URL || "https://app.ruleto.mx",
};

if (!env.REACT_APP_SUPABASE_URL || !env.REACT_APP_SUPABASE_ANON_KEY) {
  console.error(
    "No se puede crear el APK: descarga primero las variables de produccion en .env.android.local."
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [path.resolve(__dirname, "build.js")], {
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
