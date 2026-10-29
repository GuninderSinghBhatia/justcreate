import "server-only";

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Fetching URLs that users hand us (a capture's remote image) without letting them reach our own
 * network: every address a host resolves to must be public, checked at connect time (so DNS can't
 * swap it after the check), redirects are followed by hand and re-checked, and the body is capped
 * while it streams in.
 */

const blocked = new net.BlockList();
for (const [net4, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net4, bits, "ipv4");
}
for (const [net6, bits] of [
  ["::", 128],
  ["::1", 128],
  // IPv4-mapped addresses (::ffff:127.0.0.1) are checked against the IPv4 ranges by BlockList itself.
  ["64:ff9b::", 96], // NAT64
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net6, bits, "ipv6");
}

export function isPublicAddress(address: string) {
  const family = net.isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function publicLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} is not a public address`), { code: "EBLOCKED" }), "");
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

export class FetchBlocked extends Error {}

export interface Fetched {
  status: number;
  contentType: string;
  body: Buffer;
}

/**
 * GETs a public http(s) URL. Throws FetchBlocked for private targets and bodies over `maxBytes`;
 * other failures (DNS, timeout, reset) throw as they are. Non-2xx responses are returned.
 */
export async function fetchPublic(url: string, { maxBytes, timeoutMs = 15_000, maxRedirects = 3 }: { maxBytes: number; timeoutMs?: number; maxRedirects?: number }): Promise<Fetched> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = new URL(url);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== "https:" && current.protocol !== "http:") throw new FetchBlocked(`Unsupported protocol ${current.protocol}`);
    // A literal IP never goes through the lookup below.
    const host = current.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) throw new FetchBlocked(`${host} is not a public address`);

    const res = await get(current, signal);
    const location = res.headers.location;
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
      res.resume();
      current = new URL(location, current);
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    return { status: res.statusCode ?? 0, contentType, body: await readCapped(res, maxBytes) };
  }
  throw new FetchBlocked("Too many redirects");
}

function get(url: URL, signal: AbortSignal) {
  const client = url.protocol === "https:" ? https : http;
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = client.get(url, {
      signal,
      lookup: publicLookup as unknown as net.LookupFunction,
      headers: { "user-agent": "Mozilla/5.0 (compatible; JUSTCREATE)", accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    });
    req.on("response", resolve);
    req.on("error", (err: NodeJS.ErrnoException) => reject(err.code === "EBLOCKED" ? new FetchBlocked(err.message) : err));
  });
}

function readCapped(res: http.IncomingMessage, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    if (Number(res.headers["content-length"]) > maxBytes) {
      res.destroy();
      return reject(new FetchBlocked("Response too large"));
    }
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        res.destroy();
        reject(new FetchBlocked("Response too large"));
      } else chunks.push(chunk);
    });
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

/** The image type from a file's first bytes, for the formats we store; null for anything else. */
export function sniffImage(head: Uint8Array): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}
