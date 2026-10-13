import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnvFile } from "./run-v1-production-env-preflight.mjs";

const localOcrEnvRelativePath = ".erp-local-storage/tencent-ocr/secure.env";
const ocrEnvNames = [
  "ERP_TENCENT_OCR_SECRET_ID",
  "ERP_TENCENT_OCR_SECRET_KEY",
  "ERP_TENCENT_OCR_REGION",
];
const frontendPrivateOcrEnvNames = [
  ...ocrEnvNames,
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "TENCENTCLOUD_REGION",
];

export function buildCompleteReviewApiEnv({ rootDir, baseEnv = process.env } = {}) {
  const apiEnv = { ...baseEnv };
  const explicitSecretId = cleanText(apiEnv.ERP_TENCENT_OCR_SECRET_ID ?? apiEnv.TENCENTCLOUD_SECRET_ID);
  const explicitSecretKey = cleanText(apiEnv.ERP_TENCENT_OCR_SECRET_KEY ?? apiEnv.TENCENTCLOUD_SECRET_KEY);
  if (explicitSecretId || explicitSecretKey) {
    assertCompleteCredentialPair(explicitSecretId, explicitSecretKey, "当前进程");
    return apiEnv;
  }

  const envPath = resolve(rootDir, localOcrEnvRelativePath);
  if (!existsSync(envPath)) return apiEnv;

  const fileMode = statSync(envPath).mode & 0o777;
  if ((fileMode & 0o077) !== 0) {
    throw new Error("本地腾讯云 OCR 配置权限过宽；请恢复为仅当前用户可读写的 0600。");
  }

  const parsed = parseEnvFile(readFileSync(envPath, "utf8"));
  const secretId = cleanText(parsed.ERP_TENCENT_OCR_SECRET_ID);
  const secretKey = cleanText(parsed.ERP_TENCENT_OCR_SECRET_KEY);
  assertCompleteCredentialPair(secretId, secretKey, "本地安全配置");
  for (const name of ocrEnvNames) {
    if (cleanText(parsed[name])) apiEnv[name] = parsed[name];
  }
  return apiEnv;
}

export function buildCompleteReviewFrontendEnv({ baseEnv = process.env } = {}) {
  const frontendEnv = { ...baseEnv };
  for (const name of frontendPrivateOcrEnvNames) delete frontendEnv[name];
  return frontendEnv;
}

function assertCompleteCredentialPair(secretId, secretKey, sourceLabel) {
  if (secretId && secretKey) return;
  throw new Error(`${sourceLabel}中的腾讯云 OCR 凭据不完整；SecretId 与 SecretKey 必须同时配置。`);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
