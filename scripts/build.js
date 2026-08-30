const { spawnSync } = require("node:child_process");

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

const result = spawnSync(
  process.execPath,
  [require.resolve("react-scripts/bin/react-scripts"), "build"],
  { env, stdio: "inherit" }
);

process.exit(result.status ?? 1);
