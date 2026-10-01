const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const env = {
  ...process.env,
  REACT_APP_SUPABASE_URL:
    process.env.REACT_APP_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "",
  REACT_APP_SUPABASE_ANON_KEY:
    process.env.REACT_APP_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "",
};

if (!env.REACT_APP_SUPABASE_URL || !env.REACT_APP_SUPABASE_ANON_KEY) {
  console.error(
    "Build cancelado: faltan REACT_APP_SUPABASE_URL o REACT_APP_SUPABASE_ANON_KEY. " +
    "Sin ellas la aplicacion Android abre en negro antes de renderizar."
  );
  process.exit(1);
}

const buildNumber = env.REACT_APP_BUILD_NUMBER || String(Date.now());
env.REACT_APP_BUILD_NUMBER = buildNumber;
env.REACT_APP_BUILD_LABEL = env.REACT_APP_BUILD_LABEL || (env.VERCEL_GIT_COMMIT_SHA || new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')).slice(0, 20);
const result = spawnSync(
  process.execPath,
  [require.resolve("react-scripts/bin/react-scripts"), "build"],
  { env, stdio: "inherit" }
);

if (result.status === 0) fs.writeFileSync(path.join(__dirname, '..', 'build', 'build-info.json'), JSON.stringify({build_number:Number(buildNumber),version_label:env.REACT_APP_BUILD_LABEL}));
process.exit(result.status ?? 1);
