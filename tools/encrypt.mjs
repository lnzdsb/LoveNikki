#!/usr/bin/env node
/**
 * 把 source/works.json 加密成 site/data/works.enc.js
 *
 * 用法：
 *   node tools/encrypt.mjs 你的口令
 *
 * 平时可以只用 admin.html 导出，这个脚本是命令行备用。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const password = process.argv[2] || process.env.GALLERY_PASSWORD;
const isDemo = process.argv.includes("--demo");

if (!password) {
  console.error("用法: node tools/encrypt.mjs <口令> [--demo]");
  process.exit(1);
}

const source = JSON.parse(await readFile(path.join(root, "source", "works.json"), "utf8"));
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const encoder = new TextEncoder();

const baseKey = await crypto.subtle.importKey(
  "raw",
  encoder.encode(password),
  "PBKDF2",
  false,
  ["deriveKey"]
);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"]
);
const plaintext = encoder.encode(JSON.stringify(source));
const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const payload = {
  v: 1,
  alg: "AES-GCM",
  kdf: "PBKDF2-SHA-256",
  iterations: 210000,
  salt: b64(salt),
  iv: b64(iv),
  ciphertext: b64(new Uint8Array(cipher)),
  demo: isDemo
};

await mkdir(path.join(root, "site", "data"), { recursive: true });
const out =
  "/* 由 tools/encrypt.mjs 生成，请勿手改；需要更新请重新导出 */\n" +
  "window.__GALLERY_DATA__ = " +
  JSON.stringify(payload) +
  ";\n";
await writeFile(path.join(root, "site", "data", "works.enc.js"), out, "utf8");

const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
console.log(`已加密 ${source.works.length} 件作品 -> site/data/works.enc.js (${kb} KB)`);
