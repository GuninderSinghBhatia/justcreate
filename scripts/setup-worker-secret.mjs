// Gives the hosted worker (apps/worker/modal_app.py) its settings, and the web app the token to wake it:
// - Modal secret "justcreate-worker": SUPABASE_URL, SUPABASE_SECRET_KEY and the LLM settings, read from
//   apps/web/.env.local and apps/worker/.env (the files the local worker uses), plus a new WAKE_TOKEN.
// - Vercel production env WORKER_TOKEN: the same token. WORKER_URL is set separately (the deployed URL).
// Needs `modal token new` and `vercel login` done. Re-run it to rotate the token or after changing keys.
//
//   node scripts/setup-worker-secret.mjs
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => {
  try {
    return Object.fromEntries(
      readFileSync(join(root, file), "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
};
const web = read("apps/web/.env.local");
const worker = read("apps/worker/.env");

const token = randomBytes(32).toString("hex");
const settings = {
  SUPABASE_URL: web.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SECRET_KEY: web.SUPABASE_SECRET_KEY,
  LLM_PROVIDER: worker.LLM_PROVIDER,
  GROQ_API_KEY: worker.GROQ_API_KEY,
  GEMINI_API_KEY: worker.GEMINI_API_KEY,
  ANTHROPIC_API_KEY: worker.ANTHROPIC_API_KEY,
  WAKE_TOKEN: token,
};
const kept = Object.entries(settings).filter(([, v]) => v);
if (!settings.SUPABASE_URL || !settings.SUPABASE_SECRET_KEY) throw new Error("apps/web/.env.local is missing the Supabase URL or secret key");

const dir = mkdtempSync(join(tmpdir(), "justcreate-"));
const file = join(dir, "worker.env");
try {
  writeFileSync(file, kept.map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  execFileSync("uvx", ["--with", "python-dotenv", "modal", "secret", "create", "justcreate-worker", "--from-dotenv", file, "--force"], {
    cwd: join(root, "apps/worker"),
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  console.log(`Modal secret justcreate-worker: ${kept.map(([k]) => k).join(", ")}`);

  // Replace the Vercel value if there is one, then add the new token (sensitive: never shown again).
  // npx is a .cmd on Windows, so it needs a shell there (its arguments have no spaces).
  const vercel = (args, input) =>
    execFileSync("npx", ["-y", "vercel@latest", ...args], {
      cwd: root,
      input,
      stdio: ["pipe", "ignore", "ignore"],
      shell: process.platform === "win32",
    });
  try {
    vercel(["env", "rm", "WORKER_TOKEN", "production", "--yes"]);
  } catch {
    // not set yet
  }
  vercel(["env", "add", "WORKER_TOKEN", "production", "--sensitive"], token);
  console.log("Vercel WORKER_TOKEN (production): set");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
