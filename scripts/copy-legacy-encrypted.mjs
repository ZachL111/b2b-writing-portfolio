import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_DATA = path.join(ROOT, "portfolio-data.js");
const OUTPUT = path.join(ROOT, "out", "samples", "encrypted");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function assertSafeEncryptedPath(value) {
  if (
    typeof value !== "string" ||
    !/^samples\/encrypted\/[a-z0-9-]+\.enc$/i.test(value)
  ) {
    throw new Error(`Unsafe legacy encrypted path: ${value}`);
  }
  return value;
}

async function main() {
  if (!(await exists(LEGACY_DATA))) {
    process.stdout.write("No legacy encrypted portfolio was present; static placeholders remain locked.\n");
    return;
  }

  const source = await readFile(LEGACY_DATA, "utf8");
  const match = source.match(/window\.PORTFOLIO_DATA\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error("portfolio-data.js has an unexpected format.");
  const data = JSON.parse(match[1]);
  const assets = [
    ...(Array.isArray(data.samples) ? data.samples.map((sample) => sample.encryptedFile) : []),
    data.privateClientMetadata?.encryptedFile,
  ].filter(Boolean);

  await mkdir(OUTPUT, { recursive: true });
  for (const asset of assets) {
    const safePath = assertSafeEncryptedPath(asset);
    const sourceFile = path.join(ROOT, safePath);
    if (!(await exists(sourceFile))) {
      throw new Error(`Missing legacy encrypted asset: ${safePath}`);
    }
    await copyFile(sourceFile, path.join(OUTPUT, path.basename(safePath)));
  }

  await writeFile(
    path.join(OUTPUT, "legacy-manifest.json"),
    `${JSON.stringify(data)}\n`,
    "utf8",
  );
  process.stdout.write(`Copied ${assets.length} legacy encrypted portfolio assets.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
