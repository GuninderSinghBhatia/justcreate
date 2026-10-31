// End-to-end check of captures and canvas saves against the real Supabase and a running web app:
// files go straight to storage and are stored byte for byte, bad uploads are refused and removed,
// and boards larger than the host's request limit save gzipped. Uses a throwaway user, deleted after.
//
//   node scripts/e2e-uploads.mjs [app url]     (default http://localhost:3100; reads apps/web/.env.local)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { deflateSync, gzipSync, crc32 } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const APP = process.argv[2] ?? "http://localhost:3100";
const require = createRequire(`${root}/apps/web/package.json`);
const { createClient } = require("@supabase/supabase-js");
// Node 22.18+ runs the shared TypeScript source directly.
const shared = await import(pathToFileURL(`${root}/packages/shared/src/index.ts`).href);

const env = Object.fromEntries(
  readFileSync(`${root}/apps/web/.env.local`, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(SUPABASE, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** A real PNG of random pixels, stored uncompressed: about w*h*3 bytes. */
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
  for (let y = 0; y < h; y++) randomBytes(w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 0 })), chunk("IEND", Buffer.alloc(0))]);
}

const email = `justcreate-e2e-${Date.now()}@example.com`;
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
try {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: session, error: otpError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (otpError) throw otpError;
  const token = session.session.access_token;
  const api = (path, init) => fetch(`${APP}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  const asUser = createClient(SUPABASE, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const download = async (path) => Buffer.from(await (await admin.storage.from("captures").download(path)).data.arrayBuffer());

  // A file over the host's 4.5 MB request limit, plus a thumbnail: stored byte for byte.
  const big = png(1700, 1700);
  const thumb = png(300, 300);
  const saved = await shared.sendCapture(
    api,
    { type: "screenshot", title: "e2e big", metadata: { width: 1700, height: 1700 } },
    new Blob([big], { type: "image/png" }),
    new Blob([thumb]),
  );
  check("big capture saved", "reference" in saved, "error" in saved ? saved.error : `${(big.length / 1e6).toFixed(1)} MB`);
  if ("reference" in saved) {
    const ref = saved.reference;
    check("file stored byte-identical", sha(await download(ref.file_path)) === sha(big));
    check("thumbnail stored byte-identical", sha(await download(ref.thumbnail_path)) === sha(thumb));
    check("thumbnail separate from file", ref.thumbnail_path !== ref.file_path);
    const { data: items } = await asUser.from("board_items").select("reference_id").eq("reference_id", ref.id);
    check("placed on the board", items?.length === 1);
    const { data: jobs } = await admin.from("jobs").select("kind").eq("reference_id", ref.id);
    check("analysis queued", jobs?.some((j) => j.kind === "analyze"));

    const reuse = await api("/api/captures", json({ meta: { type: "image" }, filePath: ref.file_path }));
    check("reused path refused", reuse.status === 409, String(reuse.status));
    check("original file kept", (await download(ref.file_path)).length === big.length);
  }

  // Declared PNG, uploaded HTML: refused, and the stray file removed.
  {
    const ticket = await (await api("/api/captures/uploads", json({ files: [{ type: "image/png", size: 40 }] }))).json();
    const put = await fetch(ticket.uploads[0].url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: "<html><script>alert(1)</script></html>" });
    check("PUT to signed URL", put.ok, String(put.status));
    const res = await api("/api/captures", json({ meta: { type: "image" }, filePath: ticket.uploads[0].path }));
    check("non-image bytes refused", res.status === 415, String(res.status));
    const { data: left } = await admin.storage.from("captures").list(userId, { search: ticket.uploads[0].path.split("/")[1] });
    check("refused upload removed", left?.length === 0);
  }

  // Real PNG bytes stored with another Content-Type: refused.
  {
    const ticket = await (await api("/api/captures/uploads", json({ files: [{ type: "image/png", size: thumb.length }] }))).json();
    await fetch(ticket.uploads[0].url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: thumb });
    const res = await api("/api/captures", json({ meta: { type: "image" }, filePath: ticket.uploads[0].path }));
    check("wrong stored Content-Type refused", res.status === 415, String(res.status));
  }

  {
    const other = await api("/api/captures", json({ meta: { type: "image" }, filePath: `00000000-0000-0000-0000-000000000000/${crypto.randomUUID()}.png` }));
    check("another user's folder refused", other.status === 400, String(other.status));
    const bogus = await api("/api/captures/uploads", json({ files: [{ type: "toString", size: 10 }] }));
    check("unknown type refused", bogus.status === 415, String(bogus.status));
    const huge = await api("/api/captures/uploads", json({ files: [{ type: "image/png", size: 60 * 1024 * 1024 }] }));
    check("over 50 MB refused", huge.status === 413, String(huge.status));
  }

  {
    const noCall = () => {
      throw new Error("no request expected");
    };
    const svg = await shared.sendCapture(noCall, { type: "image" }, new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"]));
    check("SVG refused before any request", svg.status === 415);
  }

  // Older extensions still post multipart.
  {
    const form = new FormData();
    form.set("meta", JSON.stringify({ type: "image", title: "e2e legacy" }));
    form.set("file", new Blob([thumb], { type: "image/png" }));
    const res = await api("/api/captures", { method: "POST", body: form });
    const body = await res.json();
    check("multipart capture", res.status === 201, String(res.status));
    if (body.reference) check("multipart file byte-identical", sha(await download(body.reference.file_path)) === sha(thumb));
  }

  {
    const page = await shared.sendCapture(api, { type: "webpage", title: "e2e page", sourceUrl: "https://example.com/" });
    check("capture without a file", "reference" in page, "error" in page ? page.error : "");
  }

  // Canvas: a big board saves gzipped and comes back intact, coordinates to the last digit.
  {
    const { data: board } = await asUser.from("boards").select("id").limit(1).single();
    const elements = Array.from({ length: 760 }, (_, i) => ({
      id: `e${i}`,
      type: "freedraw",
      x: i,
      y: i,
      points: Array.from({ length: 120 }, (_, k) => [k * 1.234567, k * 2.345678]),
    }));
    const text = JSON.stringify({ document: { type: "excalidraw", elements }, items: [], removed: [] });
    const zipped = gzipSync(text);
    const gz = { "Content-Type": "application/octet-stream", "X-Body-Encoding": "gzip" };
    const res = await api(`/api/boards/${board.id}/canvas`, { method: "PUT", headers: gz, body: zipped });
    check("gzipped board save", res.ok, `${(text.length / 1e6).toFixed(1)} MB sent as ${(zipped.length / 1e6).toFixed(2)} MB, ${res.status}`);
    const { data: stored } = await asUser.from("boards").select("document").eq("id", board.id).single();
    const back = stored?.document?.elements ?? [];
    const same = back.length === elements.length && back.every((el, i) => el.id === elements[i].id && JSON.stringify(el.points) === JSON.stringify(elements[i].points));
    const bad = back.findIndex((el, i) => JSON.stringify(el.points) !== JSON.stringify(elements[i]?.points));
    if (bad >= 0) console.log("first mismatch", bad, JSON.stringify(back[bad].points).slice(0, 200), JSON.stringify(elements[bad].points).slice(0, 200));
    check("board stored intact", same, `${back.length} elements`);

    const plain = await api(`/api/boards/${board.id}/canvas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: { type: "excalidraw", elements: elements.slice(0, 3) }, items: [], removed: [] }),
    });
    check("plain board save", plain.ok, String(plain.status));
    const bomb = await api(`/api/boards/${board.id}/canvas`, { method: "PUT", headers: gz, body: gzipSync(Buffer.alloc(30 * 1024 * 1024, 32)) });
    check("gzip bomb refused", bomb.status === 413, String(bomb.status));
  }
} finally {
  const { data: files } = await admin.storage.from("captures").list(userId, { limit: 1000 });
  if (files?.length) await admin.storage.from("captures").remove(files.map((f) => `${userId}/${f.name}`));
  await admin.from("jobs").delete().eq("user_id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleanup: ${files?.length ?? 0} files removed, test user deleted: ${!error}${error ? ` (${error.message})` : ""}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
