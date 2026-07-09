import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import { readFile, readdir, rename, rm, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_ROOT = path.join(ROOT, "private-samples-raw");
const PRIVATE_MANIFEST = path.join(PRIVATE_ROOT, "manifest.private.json");
const OUTPUT_ROOT = path.join(ROOT, "public", "samples", "encrypted");
const STAGING_ROOT = path.join(ROOT, "public", "samples", `.encrypted-staging-${process.pid}`);
const BACKUP_ROOT = path.join(ROOT, "public", "samples", `.encrypted-backup-${process.pid}`);
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const subtle = webcrypto.subtle;

function encodeBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64Url(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function safeObjectId() {
  return randomUUID().replaceAll("-", "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this command in an interactive terminal so the phrase can be entered privately.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };

    process.stdout.write(label);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function importPhrase(phrase) {
  const bytes = encoder.encode(phrase.normalize("NFKC"));
  try {
    return subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
  } finally {
    bytes.fill(0);
  }
}

async function deriveKey(phraseKey, salt, usage) {
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    phraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

async function encryptPayload(plaintext, kind, phraseKey, directory) {
  const id = safeObjectId();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const aad = `zl-b2b-vault:v1:${id}:${kind}`;
  const key = await deriveKey(phraseKey, salt, "encrypt");
  const encrypted = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(aad), tagLength: 128 },
      key,
      plaintext,
    ),
  );

  const binaryName = `${id}.bin`;
  const headerName = `${id}.json`;
  const binaryPath = path.join(directory, binaryName);
  const headerPath = path.join(directory, headerName);
  const header = {
    v: 1,
    id,
    kind,
    alg: "PBKDF2-SHA256/A256GCM",
    kdf: { iterations: ITERATIONS, salt: encodeBase64Url(salt) },
    gcm: { iv: encodeBase64Url(iv), tagBits: 128 },
    aad,
    ciphertext: `samples/encrypted/objects/${binaryName}`,
  };

  await writeFile(binaryPath, encrypted, { mode: 0o644 });
  await writeFile(headerPath, `${JSON.stringify(header)}\n`, { mode: 0o644 });
  return { header, headerName, plaintextHash: createHash("sha256").update(plaintext).digest("hex") };
}

async function decryptForVerification(header, phraseKey, directory) {
  const salt = decodeBase64Url(header.kdf.salt);
  const iv = decodeBase64Url(header.gcm.iv);
  const binaryName = path.basename(header.ciphertext);
  const ciphertext = await readFile(path.join(directory, binaryName));
  const key = await deriveKey(phraseKey, salt, "decrypt");
  return new Uint8Array(
    await subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(header.aad),
        tagLength: 128,
      },
      key,
      ciphertext,
    ),
  );
}

function validatePrivateManifest(value) {
  assert(value?.schema === 1, "Private manifest must use schema 1.");
  assert(Array.isArray(value.clients) && value.clients.length === 5, "Private manifest must contain five clients.");
  const expected = new Set(["client-01", "client-02", "client-03", "client-04", "client-05"]);
  const documentIds = new Set();

  for (const client of value.clients) {
    assert(expected.delete(client.publicId), `Unexpected or duplicate publicId: ${client.publicId}`);
    assert(typeof client.realName === "string" && client.realName.trim(), `Missing realName for ${client.publicId}`);
    assert(Array.isArray(client.documents), `Missing documents array for ${client.publicId}`);
    for (const document of client.documents) {
      assert(/^[a-z0-9-]{3,80}$/.test(document.id), `Invalid document id: ${document.id}`);
      assert(!documentIds.has(document.id), `Duplicate document id: ${document.id}`);
      documentIds.add(document.id);
      assert(typeof document.title === "string" && document.title.trim(), `Missing title for ${document.id}`);
      assert(typeof document.formatLabel === "string" && document.formatLabel.trim(), `Missing formatLabel for ${document.id}`);
      assert(typeof document.file === "string" && document.file, `Missing file for ${document.id}`);
    }
  }
  return value;
}

function resolvePrivateFile(relativePath) {
  const resolved = path.resolve(PRIVATE_ROOT, relativePath);
  assert(resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`), `Document path escapes private source: ${relativePath}`);
  return resolved;
}

function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  throw new Error(`Unsupported writing sample type: ${extension || "none"}. Use PDF or DOCX.`);
}

async function build() {
  const privateManifest = validatePrivateManifest(JSON.parse(await readFile(PRIVATE_MANIFEST, "utf8")));
  let phrase = await readHidden("Portfolio access phrase: ");
  const confirmation = await readHidden("Confirm access phrase: ");
  assert(phrase === confirmation, "The phrases did not match.");
  assert(phrase.normalize("NFKC").length >= 16, "Use a high-entropy phrase of at least 16 characters.");
  const phraseKey = await importPhrase(phrase);
  phrase = "";

  await rm(STAGING_ROOT, { recursive: true, force: true });
  const objectDirectory = path.join(STAGING_ROOT, "objects");
  await mkdir(objectDirectory, { recursive: true });

  const encryptedClients = [];
  const verificationItems = [];
  for (const client of privateManifest.clients) {
    const documents = [];
    for (const document of client.documents) {
      const sourcePath = resolvePrivateFile(document.file);
      const fileInfo = await stat(sourcePath);
      assert(fileInfo.isFile(), `Not a file: ${document.file}`);
      assert(fileInfo.size <= 45 * 1024 * 1024, `File exceeds 45 MB: ${document.file}`);
      const bytes = new Uint8Array(await readFile(sourcePath));
      const encrypted = await encryptPayload(bytes, "document", phraseKey, objectDirectory);
      verificationItems.push({ ...encrypted, kind: "document" });
      documents.push({
        id: document.id,
        title: document.title.trim(),
        formatLabel: document.formatLabel.trim(),
        mimeType: mimeFor(document.file),
        downloadName: path.basename(document.file),
        envelopePath: `samples/encrypted/objects/${encrypted.headerName}`,
      });
      bytes.fill(0);
    }
    encryptedClients.push({
      publicId: client.publicId,
      realName: client.realName.trim(),
      documents,
    });
  }

  const manifestPlaintext = encoder.encode(JSON.stringify({ schema: 1, clients: encryptedClients }));
  const encryptedManifest = await encryptPayload(manifestPlaintext, "manifest", phraseKey, objectDirectory);
  verificationItems.push({ ...encryptedManifest, kind: "manifest" });
  await writeFile(
    path.join(STAGING_ROOT, "portfolio-manifest.json"),
    `${JSON.stringify(encryptedManifest.header)}\n`,
    { mode: 0o644 },
  );
  manifestPlaintext.fill(0);

  for (const item of verificationItems) {
    const decrypted = await decryptForVerification(item.header, phraseKey, objectDirectory);
    const hash = createHash("sha256").update(decrypted).digest("hex");
    decrypted.fill(0);
    assert(hash === item.plaintextHash, `Verification failed for ${item.kind} ${item.header.id}`);
  }

  await rm(BACKUP_ROOT, { recursive: true, force: true });
  try {
    await rename(OUTPUT_ROOT, BACKUP_ROOT);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rename(STAGING_ROOT, OUTPUT_ROOT);
  await rm(BACKUP_ROOT, { recursive: true, force: true });
  process.stdout.write(`Encrypted ${verificationItems.length - 1} document(s) and one private manifest.\n`);
}

async function listFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(file)));
    else output.push(file);
  }
  return output;
}

async function audit() {
  const publicFiles = await listFiles(path.join(ROOT, "public"));
  const raw = publicFiles.filter((file) => /\.(pdf|docx|md|txt)$/i.test(file));
  assert(raw.length === 0, `Raw document found in public/: ${raw.map((file) => path.relative(ROOT, file)).join(", ")}`);

  const denylistPath = path.join(PRIVATE_ROOT, "client-denylist.txt");
  let terms = [];
  try {
    terms = (await readFile(denylistPath, "utf8"))
      .split(/\r?\n/)
      .map((term) => term.trim())
      .filter(Boolean);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (terms.length) {
    const inspectRoots = [path.join(ROOT, "app"), path.join(ROOT, "public"), path.join(ROOT, "config")];
    for (const inspectRoot of inspectRoots) {
      for (const file of await listFiles(inspectRoot)) {
        if (/\.(bin|png|jpe?g|gif|webp|ico)$/i.test(file)) continue;
        const content = (await readFile(file, "utf8")).toLocaleLowerCase();
        for (const term of terms) {
          assert(!content.includes(term.toLocaleLowerCase()), `Private name found in ${path.relative(ROOT, file)}`);
        }
      }
    }
  }
  process.stdout.write("Portfolio privacy audit passed.\n");
}

async function clearEncrypted() {
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(path.join(OUTPUT_ROOT, ".gitkeep"), "\n", { mode: 0o644 });
  process.stdout.write("Encrypted portfolio output cleared.\n");
}

const command = process.argv[2];
try {
  if (command === "build") await build();
  else if (command === "audit") await audit();
  else if (command === "clear") await clearEncrypted();
  else {
    process.stderr.write("Usage: node scripts/encrypt-portfolio.mjs <build|audit|clear>\n");
    process.exitCode = 1;
  }
} finally {
  await rm(STAGING_ROOT, { recursive: true, force: true });
}
