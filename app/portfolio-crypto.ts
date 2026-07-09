export type PrivateDocument = {
  id: string;
  title: string;
  formatLabel: string;
  mimeType: string;
  downloadName: string;
  envelopePath?: string;
  legacyAsset?: LegacyAsset;
};

type LegacyAsset = {
  encryptedFile: string;
  salt: string;
  iv: string;
  iterations: number;
};

export type PrivateClient = {
  publicId: string;
  realName: string;
  documents: PrivateDocument[];
};

export type PrivatePortfolio = {
  schema: 1;
  clients: PrivateClient[];
};

type EnvelopeHeader = {
  v: 1;
  id: string;
  kind: "manifest" | "document";
  alg: "PBKDF2-SHA256/A256GCM";
  kdf: {
    iterations: number;
    salt: string;
  };
  gcm: {
    iv: string;
    tagBits: 128;
  };
  aad: string;
  ciphertext: string;
};

type AccessErrorCode =
  | "not-configured"
  | "unsupported"
  | "invalid-envelope"
  | "decryption-failed"
  | "invalid-manifest";

const MANIFEST_PATH = "samples/encrypted/portfolio-manifest.json";
const LEGACY_MANIFEST_PATH = "samples/encrypted/legacy-manifest.json";
const MIN_ITERATIONS = 300_000;
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;

export class PortfolioAccessError extends Error {
  code: AccessErrorCode;

  constructor(code: AccessErrorCode, message: string) {
    super(message);
    this.name = "PortfolioAccessError";
    this.code = code;
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new PortfolioAccessError("invalid-envelope", "Invalid encoded value");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new PortfolioAccessError("invalid-envelope", "Invalid encoded value");
  }
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function isSameOriginVaultPath(path: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/")) return false;
  const resolved = new URL(path, document.baseURI);
  return (
    resolved.origin === window.location.origin &&
    resolved.pathname.includes("/samples/encrypted/")
  );
}

function validateHeader(value: unknown, expectedKind?: EnvelopeHeader["kind"]): EnvelopeHeader {
  if (!value || typeof value !== "object") {
    throw new PortfolioAccessError("invalid-envelope", "Missing envelope header");
  }

  const header = value as Partial<EnvelopeHeader>;
  const valid =
    header.v === 1 &&
    typeof header.id === "string" &&
    /^[a-f0-9]{32}$/.test(header.id) &&
    (header.kind === "manifest" || header.kind === "document") &&
    (!expectedKind || header.kind === expectedKind) &&
    header.alg === "PBKDF2-SHA256/A256GCM" &&
    header.kdf?.iterations !== undefined &&
    Number.isInteger(header.kdf.iterations) &&
    header.kdf.iterations >= MIN_ITERATIONS &&
    typeof header.kdf.salt === "string" &&
    header.gcm?.tagBits === 128 &&
    typeof header.gcm.iv === "string" &&
    typeof header.aad === "string" &&
    header.aad === `zl-b2b-vault:v1:${header.id}:${header.kind}` &&
    typeof header.ciphertext === "string" &&
    isSameOriginVaultPath(header.ciphertext);

  if (!valid) {
    throw new PortfolioAccessError("invalid-envelope", "Invalid envelope header");
  }

  const salt = decodeBase64Url(header.kdf!.salt!);
  const iv = decodeBase64Url(header.gcm!.iv!);
  if (salt.byteLength !== 16 || iv.byteLength !== 12) {
    throw new PortfolioAccessError("invalid-envelope", "Invalid encryption parameters");
  }

  return header as EnvelopeHeader;
}

async function fetchJson(path: string): Promise<unknown> {
  const url = new URL(path, document.baseURI);
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (response.status === 404) {
    throw new PortfolioAccessError("not-configured", "Encrypted portfolio not found");
  }
  if (!response.ok) {
    throw new PortfolioAccessError("invalid-envelope", "Could not load envelope");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new PortfolioAccessError("not-configured", "Encrypted portfolio not found");
  }
  try {
    return await response.json();
  } catch {
    throw new PortfolioAccessError("invalid-envelope", "Envelope could not be parsed");
  }
}

async function fetchCiphertext(path: string): Promise<ArrayBuffer> {
  const url = new URL(path, document.baseURI);
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    throw new PortfolioAccessError("invalid-envelope", "Could not load ciphertext");
  }

  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_PAYLOAD_BYTES) {
    throw new PortfolioAccessError("invalid-envelope", "Encrypted file is too large");
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > MAX_PAYLOAD_BYTES) {
    throw new PortfolioAccessError("invalid-envelope", "Invalid encrypted file size");
  }
  return buffer;
}

async function importPhrase(phrase: string, normalize = true): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new PortfolioAccessError(
      "unsupported",
      "Private access requires a secure HTTPS browser context",
    );
  }
  const bytes = new TextEncoder().encode(normalize ? phrase.normalize("NFKC") : phrase);
  try {
    return await globalThis.crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
  } finally {
    bytes.fill(0);
  }
}

async function decryptEnvelope(
  headerPath: string,
  phraseKey: CryptoKey,
  expectedKind: EnvelopeHeader["kind"],
): Promise<Uint8Array> {
  const header = validateHeader(await fetchJson(headerPath), expectedKind);
  const salt = decodeBase64Url(header.kdf.salt);
  const iv = decodeBase64Url(header.gcm.iv);
  const key = await globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations: header.kdf.iterations,
    },
    phraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: new TextEncoder().encode(header.aad),
        tagLength: header.gcm.tagBits,
      },
      key,
      await fetchCiphertext(header.ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new PortfolioAccessError("decryption-failed", "Payload authentication failed");
  }
}

function validateManifest(value: unknown): PrivatePortfolio {
  if (!value || typeof value !== "object") {
    throw new PortfolioAccessError("invalid-manifest", "Invalid manifest");
  }
  const portfolio = value as Partial<PrivatePortfolio>;
  if (portfolio.schema !== 1 || !Array.isArray(portfolio.clients)) {
    throw new PortfolioAccessError("invalid-manifest", "Invalid manifest schema");
  }

  const publicIds = new Set<string>();
  const documentIds = new Set<string>();
  const clients = portfolio.clients.map((client) => {
    if (
      !client ||
      typeof client.publicId !== "string" ||
      !/^client-0[1-5]$/.test(client.publicId) ||
      publicIds.has(client.publicId) ||
      typeof client.realName !== "string" ||
      !client.realName.trim() ||
      !Array.isArray(client.documents)
    ) {
      throw new PortfolioAccessError("invalid-manifest", "Invalid client record");
    }
    publicIds.add(client.publicId);

    const documents = client.documents.map((document) => {
      if (
        !document ||
        typeof document.id !== "string" ||
        !/^[a-z0-9-]{3,80}$/.test(document.id) ||
        documentIds.has(document.id) ||
        typeof document.title !== "string" ||
        typeof document.formatLabel !== "string" ||
        !["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(document.mimeType) ||
        typeof document.downloadName !== "string" ||
        !/^[^/\\]{1,160}\.(pdf|docx)$/i.test(document.downloadName) ||
        typeof document.envelopePath !== "string" ||
        !isSameOriginVaultPath(document.envelopePath)
      ) {
        throw new PortfolioAccessError("invalid-manifest", "Invalid document record");
      }
      documentIds.add(document.id);
      return document;
    });

    return { ...client, realName: client.realName.trim(), documents };
  });

  if (clients.length !== 5) {
    throw new PortfolioAccessError("invalid-manifest", "Expected five client records");
  }
  return { schema: 1, clients };
}

type LegacySample = LegacyAsset & {
  id: string;
  title: string;
  format: string;
  mimeType: string;
  originalFilename: string;
};

type LegacyManifest = {
  iterations: number;
  privateClientMetadata: LegacyAsset;
  samples: LegacySample[];
};

type LegacyPrivateMetadata = {
  experience?: Record<string, { name?: string }>;
  samples?: Record<string, Partial<LegacySample> & { client?: string; formatLabel?: string }>;
};

const LEGACY_CLIENT_MAP = [
  ["client-01", "data-platform-automation"],
  ["client-02", "cloud-access-governance"],
  ["client-03", "non-human-identity-security"],
  ["client-04", "secrets-machine-identity"],
  ["client-05", "ai-code-review-ci-validation"],
] as const;

function validateLegacyAsset(value: unknown, fallbackIterations?: number): LegacyAsset {
  if (!value || typeof value !== "object") {
    throw new PortfolioAccessError("invalid-manifest", "Invalid legacy asset");
  }
  const asset = value as Partial<LegacyAsset>;
  const iterations = asset.iterations ?? fallbackIterations;
  if (
    typeof asset.encryptedFile !== "string" ||
    !isSameOriginVaultPath(asset.encryptedFile) ||
    !asset.encryptedFile.endsWith(".enc") ||
    typeof asset.salt !== "string" ||
    decodeBase64(asset.salt).byteLength !== 16 ||
    typeof asset.iv !== "string" ||
    decodeBase64(asset.iv).byteLength !== 12 ||
    !Number.isInteger(iterations) ||
    Number(iterations) < MIN_ITERATIONS
  ) {
    throw new PortfolioAccessError("invalid-manifest", "Invalid legacy encryption metadata");
  }
  return { ...asset, iterations } as LegacyAsset;
}

function validateLegacyManifest(value: unknown): LegacyManifest {
  if (!value || typeof value !== "object") {
    throw new PortfolioAccessError("invalid-manifest", "Invalid legacy manifest");
  }
  const manifest = value as Partial<LegacyManifest>;
  if (!Number.isInteger(manifest.iterations) || !Array.isArray(manifest.samples)) {
    throw new PortfolioAccessError("invalid-manifest", "Invalid legacy manifest schema");
  }
  const samples = manifest.samples.map((sample) => {
    const asset = validateLegacyAsset(sample, manifest.iterations);
    if (
      typeof sample.id !== "string" ||
      typeof sample.title !== "string" ||
      typeof sample.format !== "string" ||
      typeof sample.mimeType !== "string" ||
      typeof sample.originalFilename !== "string" ||
      !/^[^/\\]{1,160}\.(pdf|docx|md|txt|html)$/i.test(sample.originalFilename)
    ) {
      throw new PortfolioAccessError("invalid-manifest", "Invalid legacy sample");
    }
    return { ...sample, ...asset } as LegacySample;
  });
  return {
    iterations: manifest.iterations!,
    privateClientMetadata: validateLegacyAsset(
      manifest.privateClientMetadata,
      manifest.iterations,
    ),
    samples,
  };
}

async function decryptLegacyAsset(asset: LegacyAsset, phraseKey: CryptoKey): Promise<Uint8Array> {
  const validated = validateLegacyAsset(asset, asset.iterations);
  const key = await globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(decodeBase64(validated.salt)),
      iterations: validated.iterations,
    },
    phraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(decodeBase64(validated.iv)),
        tagLength: 128,
      },
      key,
      await fetchCiphertext(validated.encryptedFile),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new PortfolioAccessError("decryption-failed", "Legacy payload authentication failed");
  }
}

async function unlockLegacyPortfolio(phrase: string): Promise<{
  portfolio: PrivatePortfolio;
  phraseKey: CryptoKey;
}> {
  const manifest = validateLegacyManifest(await fetchJson(LEGACY_MANIFEST_PATH));
  const phraseKey = await importPhrase(phrase, false);
  const metadataBytes = await decryptLegacyAsset(manifest.privateClientMetadata, phraseKey);
  let metadata: LegacyPrivateMetadata;
  try {
    metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes));
  } catch {
    throw new PortfolioAccessError("invalid-manifest", "Private metadata could not be parsed");
  } finally {
    metadataBytes.fill(0);
  }

  const clients: PrivateClient[] = LEGACY_CLIENT_MAP.map(([publicId, legacyId]) => {
    const sample = manifest.samples.find((candidate) => candidate.id === legacyId);
    if (!sample) {
      throw new PortfolioAccessError("invalid-manifest", `Missing legacy sample for ${publicId}`);
    }
    const privateSample = metadata.samples?.[legacyId];
    const realName = metadata.experience?.[legacyId]?.name || privateSample?.client;
    if (typeof realName !== "string" || !realName.trim()) {
      throw new PortfolioAccessError("invalid-manifest", `Missing private client name for ${publicId}`);
    }
    return {
      publicId,
      realName: realName.trim(),
      documents: [
        {
          id: sample.id,
          title: privateSample?.title || sample.title,
          formatLabel: privateSample?.formatLabel || privateSample?.format || sample.format,
          mimeType: privateSample?.mimeType || sample.mimeType,
          downloadName: privateSample?.originalFilename || sample.originalFilename,
          legacyAsset: {
            encryptedFile: sample.encryptedFile,
            salt: sample.salt,
            iv: sample.iv,
            iterations: sample.iterations,
          },
        },
      ],
    };
  });
  return { portfolio: { schema: 1, clients }, phraseKey };
}

export async function unlockPrivatePortfolio(phrase: string): Promise<{
  portfolio: PrivatePortfolio;
  phraseKey: CryptoKey;
}> {
  const phraseKey = await importPhrase(phrase);
  let plaintext: Uint8Array;
  try {
    plaintext = await decryptEnvelope(MANIFEST_PATH, phraseKey, "manifest");
  } catch (error) {
    if (error instanceof PortfolioAccessError && error.code === "not-configured") {
      return unlockLegacyPortfolio(phrase);
    }
    throw error;
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    return { portfolio: validateManifest(parsed), phraseKey };
  } catch (error) {
    if (error instanceof PortfolioAccessError) throw error;
    throw new PortfolioAccessError("invalid-manifest", "Manifest could not be parsed");
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptDocument(
  document: PrivateDocument,
  phraseKey: CryptoKey,
): Promise<{ blob: Blob; fileName: string }> {
  let plaintext: Uint8Array;
  if (document.legacyAsset) {
    plaintext = await decryptLegacyAsset(document.legacyAsset, phraseKey);
  } else if (document.envelopePath && isSameOriginVaultPath(document.envelopePath)) {
    plaintext = await decryptEnvelope(document.envelopePath, phraseKey, "document");
  } else {
    throw new PortfolioAccessError("invalid-manifest", "Invalid document path");
  }
  try {
    return {
      blob: new Blob([plaintext.slice()], { type: document.mimeType }),
      fileName: document.downloadName,
    };
  } finally {
    plaintext.fill(0);
  }
}
