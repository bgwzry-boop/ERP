import { chmodSync, copyFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const sourcePath = resolve(process.argv[2] ?? "");
const confirmation = process.argv.includes("--confirm-main-account-credential");
if (!process.argv[2] || !confirmation) {
  fail("Usage: node scripts/import-tencent-ocr-credentials.mjs <downloaded-file> --confirm-main-account-credential");
}
if (!statSync(sourcePath).isFile()) fail("Credential source must be a file.");

const parsed = parseCredentialFile(readFileSync(sourcePath, "utf8"));
if (!parsed.secretId || !parsed.secretKey) fail("Downloaded file does not contain a Tencent Cloud SecretId and SecretKey.");
if (!/^AKID[0-9A-Za-z_-]{8,}$/.test(parsed.secretId)) fail("Downloaded Tencent Cloud SecretId has an unexpected format.");
if (parsed.secretKey.length < 16 || /[\r\n]/.test(parsed.secretKey)) fail("Downloaded Tencent Cloud SecretKey has an unexpected format.");

const secureDir = resolve(".erp-local-storage", "tencent-ocr");
const envPath = join(secureDir, "secure.env");
const sourceExtension = extname(sourcePath) || ".txt";
const archivedSourcePath = join(secureDir, `source-credential${sourceExtension}`);
mkdirSync(secureDir, { recursive: true, mode: 0o700 });
chmodSync(secureDir, 0o700);
writeFileSync(
  envPath,
  [
    `ERP_TENCENT_OCR_SECRET_ID=${encodeEnvValue(parsed.secretId)}`,
    `ERP_TENCENT_OCR_SECRET_KEY=${encodeEnvValue(parsed.secretKey)}`,
    "ERP_TENCENT_OCR_REGION=ap-guangzhou",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(envPath, 0o600);
archiveCredentialSource(sourcePath, archivedSourcePath);
chmodSync(archivedSourcePath, 0o600);

process.stdout.write(JSON.stringify({
  ok: true,
  configured: true,
  envFile: envPath,
  envFileMode: "0600",
  sourceArchived: true,
  sourceFile: basename(archivedSourcePath),
}) + "\n");

function parseCredentialFile(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!source) return {};
  try {
    const json = JSON.parse(source);
    return normalizeCredential({
      secretId: json.SecretId ?? json.secretId ?? json.secret_id,
      secretKey: json.SecretKey ?? json.secretKey ?? json.secret_key,
    });
  } catch {
    // Tencent Cloud normally downloads CSV; continue with delimiter parsing.
  }
  const rows = parseDelimitedRows(source);
  if (rows.length >= 2) {
    const headers = rows[0].map(normalizeHeader);
    const idIndex = headers.findIndex((value) => value === "secretid");
    const keyIndex = headers.findIndex((value) => value === "secretkey");
    if (idIndex >= 0 && keyIndex >= 0) {
      return normalizeCredential({ secretId: rows[1][idIndex], secretKey: rows[1][keyIndex] });
    }
  }
  return normalizeCredential({
    secretId: source.match(/Secret\s*Id\s*[:=,，]\s*["']?([^\s,"']+)/i)?.[1],
    secretKey: source.match(/Secret\s*Key\s*[:=,，]\s*["']?([^\s,"']+)/i)?.[1],
  });
}

function parseDelimitedRows(source) {
  return source.split(/\r?\n/).filter(Boolean).map((line) => {
    const values = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (!quoted && [",", "\t"].includes(character)) {
        values.push(value.trim());
        value = "";
      } else {
        value += character;
      }
    }
    values.push(value.trim());
    return values;
  });
}

function archiveCredentialSource(source, target) {
  if (source === target) return;
  try {
    renameSync(source, target);
  } catch {
    copyFileSync(source, target);
  }
}

function normalizeCredential(value = {}) {
  return {
    secretId: String(value.secretId ?? "").trim(),
    secretKey: String(value.secretKey ?? "").trim(),
  };
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

function encodeEnvValue(value) {
  return JSON.stringify(String(value));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
