#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");

const ROOT = __dirname;
const RAW_DIR = path.join(ROOT, "private-samples-raw");
const ENCRYPTED_DIR = path.join(ROOT, "samples", "encrypted");
const DATA_FILE = path.join(ROOT, "portfolio-data.js");
const MANIFEST_FILE = path.join(ENCRYPTED_DIR, "manifest.json");
const CLIENT_METADATA_FILE = path.join(RAW_DIR, "client-metadata.json");
const ITERATIONS = 310000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const MIME_TYPES = new Map([
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".doc", "application/msword"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
]);

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(ENCRYPTED_DIR, { recursive: true });

  const passphrase = await readPassphrase();
  const rawFiles = await listRawFiles();
  const hasClientMetadata = await fileExists(CLIENT_METADATA_FILE);

  if (rawFiles.length === 0 && !hasClientMetadata) {
    console.log("No raw sample files found in private-samples-raw/.");
    return;
  }

  const portfolioData = await readPortfolioData();
  const sampleMap = new Map(portfolioData.samples.map((sample) => [sample.id, sample]));
  const encryptedSamples = [];
  let privateClientMetadata = null;

  for (const file of rawFiles) {
    const sourcePath = path.join(RAW_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const id = slugify(path.basename(file, ext));
    const source = await fs.readFile(sourcePath);
    const encrypted = encryptBuffer(source, passphrase);
    const encryptedPayload = encrypted.payload;
    const encryptedFilename = `${id}.enc`;
    const encryptedPath = path.join(ENCRYPTED_DIR, encryptedFilename);
    const existing = sampleMap.get(id) || createSampleFromFile(id, file);

    await fs.writeFile(encryptedPath, encryptedPayload);

    Object.assign(existing, {
      id,
      originalFilename: file,
      mimeType: MIME_TYPES.get(ext) || "application/octet-stream",
      encryptedFile: `samples/encrypted/${encryptedFilename}`,
      salt: encrypted.salt,
      iv: encrypted.iv,
      iterations: ITERATIONS,
      bytes: encryptedPayload.length,
      encryptedAt: new Date().toISOString(),
    });

    if (!sampleMap.has(id)) {
      portfolioData.samples.push(existing);
      sampleMap.set(id, existing);
    }

    encryptedSamples.push({
      id,
      title: existing.title,
      displayLabel: existing.displayLabel || existing.title,
      originalFilename: file,
      mimeType: existing.mimeType,
      encryptedFile: existing.encryptedFile,
      salt: existing.salt,
      iv: existing.iv,
      iterations: ITERATIONS,
      bytes: existing.bytes,
      encryptedAt: existing.encryptedAt,
    });

    console.log(`Encrypted ${file} -> samples/encrypted/${encryptedFilename}`);
  }

  if (hasClientMetadata) {
    privateClientMetadata = await encryptClientMetadata(passphrase);
    portfolioData.privateClientMetadata = privateClientMetadata;
    console.log("Encrypted client-metadata.json -> samples/encrypted/client-metadata.enc");
  }

  portfolioData.iterations = ITERATIONS;
  await writePortfolioData(portfolioData);
  await writeManifest(encryptedSamples, privateClientMetadata);
  console.log(`Updated ${path.relative(ROOT, DATA_FILE)} and ${path.relative(ROOT, MANIFEST_FILE)}.`);
}

function encryptBuffer(source, passphrase) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_BYTES, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    payload: Buffer.concat([ciphertext, authTag]),
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
  };
}

async function encryptClientMetadata(passphrase) {
  const source = (await fs.readFile(CLIENT_METADATA_FILE, "utf8")).replace(/^\uFEFF/, "");
  JSON.parse(source);
  const encrypted = encryptBuffer(Buffer.from(source, "utf8"), passphrase);
  const encryptedFile = "client-metadata.enc";

  await fs.writeFile(path.join(ENCRYPTED_DIR, encryptedFile), encrypted.payload);

  return {
    encryptedFile: `samples/encrypted/${encryptedFile}`,
    mimeType: "application/json; charset=utf-8",
    salt: encrypted.salt,
    iv: encrypted.iv,
    iterations: ITERATIONS,
    bytes: encrypted.payload.length,
    encryptedAt: new Date().toISOString(),
  };
}

async function readPassphrase() {
  const piped = await readPipedPassphrase();
  if (piped) {
    return piped;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const passphrase = await rl.question("Portfolio passphrase: ");
  const confirm = await rl.question("Confirm passphrase: ");
  rl.close();

  if (!passphrase || passphrase !== confirm) {
    throw new Error("Passphrases must be non-empty and match.");
  }

  return passphrase;
}

async function readPipedPassphrase() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  if (!input.trim()) {
    return "";
  }

  const [passphrase, confirm] = input.split(/\r?\n/);
  if (!passphrase || passphrase !== confirm) {
    throw new Error("Piped passphrases must be non-empty and match.");
  }

  return passphrase;
}

async function listRawFiles() {
  const entries = await fs.readdir(RAW_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((file) => MIME_TYPES.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readPortfolioData() {
  const source = await fs.readFile(DATA_FILE, "utf8");
  const match = source.match(/window\.PORTFOLIO_DATA\s*=\s*([\s\S]*);\s*$/);
  if (!match) {
    throw new Error("portfolio-data.js must assign window.PORTFOLIO_DATA.");
  }
  return JSON.parse(match[1]);
}

async function writePortfolioData(data) {
  const serialized = JSON.stringify(data, null, 2);
  await fs.writeFile(DATA_FILE, `window.PORTFOLIO_DATA = ${serialized};\n`);
}

async function writeManifest(samples, privateClientMetadata) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    algorithm: "AES-GCM",
    keyDerivation: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    samples,
  };

  if (privateClientMetadata) {
    manifest.privateClientMetadata = privateClientMetadata;
  }

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createSampleFromFile(id, filename) {
  const title = titleCase(id.replace(/-/g, " "));
  return {
    id,
    title,
    client: "Private sample",
    description: "Encrypted writing sample.",
    format: "Writing sample",
    audience: "Recruiting review",
    tags: ["B2B writing"],
    displayLabel: title,
    originalFilename: filename,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
