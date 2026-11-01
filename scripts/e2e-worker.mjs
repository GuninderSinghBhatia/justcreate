// End-to-end check of the hosted AI worker: a throwaway user saves an image on the site, and the
// analysis must land (job done, analysis + embedding rows) without any local worker running.
//
//   node scripts/e2e-worker.mjs [app url]     (default https://justcreate-seven.vercel.app)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const APP = process.argv[2] ?? "https://justcreate-seven.vercel.app";
const require = createRequire(`${root}/apps/web/package.json`);
const { createClient } = require("@supabase/supabase-js");
const shared = await import(pathToFileURL(`${root}/packages/shared/src/index.ts`).href);

const env = Object.fromEntries(
  readFileSync(`${root}/apps/web/.env.local`, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

/** A 640×400 PNG: a dark-to-orange gradient with a light band, something with colours to analyse. */
function png(w, h) {
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const band = y > h * 0.4 && y < h * 0.55;
      raw[o] = band ? 245 : Math.round(20 + (x / w) * 230);
      raw[o + 1] = band ? 240 : Math.round(20 + (x / w) * 100);
      raw[o + 2] = band ? 230 : 40;
    }
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const email = `justcreate-e2e-${Date.now()}@example.com`;
const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (error) throw error;
const userId = created.user.id;
let ok = false;
try {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: session } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = session.session.access_token;
  const api = (path, init) => fetch(`${APP}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });

  const started = Date.now();
  const saved = await shared.sendCapture(api, { type: "image", title: "e2e worker", metadata: { width: 640, height: 400 } }, new Blob([png(640, 400)]));
  if (!("reference" in saved)) throw new Error(`capture failed: ${saved.error}`);
  const ref = saved.reference.id;
  console.log("saved; waiting for the worker…");

  for (;;) {
    const { data: jobs } = await admin.from("jobs").select("status, error, attempts").eq("reference_id", ref);
    const job = jobs?.[0];
    if (job?.status === "done" || job?.status === "failed" || Date.now() - started > 6 * 60_000) {
      const { data: analysis } = await admin.from("analyses").select("model_version, tags, palette").eq("reference_id", ref);
      const { data: embedding } = await admin.from("embeddings").select("reference_id").eq("reference_id", ref);
      const secs = Math.round((Date.now() - started) / 1000);
      console.log(`job: ${job?.status ?? "missing"} after ${secs} s${job?.error ? ` (${job.error})` : ""}`);
      console.log(`analysis: ${analysis?.length ? `${analysis[0].model_version}; tags ${analysis[0].tags?.slice(0, 5).join(", ")}; palette ${analysis[0].palette?.join(" ")}` : "none"}`);
      console.log(`embedding: ${embedding?.length ? "yes" : "none"}`);
      ok = job?.status === "done" && analysis?.length > 0 && embedding?.length > 0;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
} finally {
  const { data: files } = await admin.storage.from("captures").list(userId, { limit: 1000 });
  if (files?.length) await admin.storage.from("captures").remove(files.map((f) => `${userId}/${f.name}`));
  await admin.from("jobs").delete().eq("user_id", userId);
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  console.log(`cleanup: test user deleted: ${!deleteError}`);
  console.log(ok ? "PASS" : "FAIL");
  process.exitCode = ok ? 0 : 1;
}
