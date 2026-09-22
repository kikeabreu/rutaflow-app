const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const localEnv = path.resolve(process.cwd(), ".env.android.local");
dotenv.config({ path: localEnv, override: false });

const env = {
  ...process.env,
  REACT_APP_BUILD_TARGET: "android",
  REACT_APP_API_BASE_URL:
    process.env.REACT_APP_API_BASE_URL || "https://rutaflow-app.vercel.app",
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
