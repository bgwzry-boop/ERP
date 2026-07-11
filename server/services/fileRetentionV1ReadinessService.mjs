import { createHash } from "node:crypto";
import { STATEMENT_EXCEL_CONTENT_TYPE } from "../../src/domain/statementExcelTemplate.js";

const retentionProfiles = Object.freeze({
  attachment: {
    scope: "v1_attachment_storage_readiness",
    keyPrefix: "attachment",
    labels: {
      readWrite: "附件存储读写诊断",
      cleanup: "诊断对象清理",
      config: "存储配置完整性",
      retention: "生产留档存储模式",
      redaction: "密钥脱敏护栏",
    },
    messages: {
      readWriteReady: "诊断对象可写、可读且摘要一致",
      readWriteBlocked: "诊断对象写入、读回或摘要校验未通过",
      cleanupReady: "诊断对象已清理",
      cleanupBlocked: "诊断对象未确认清理成功",
      configReady: "当前存储配置字段完整",
      objectStorageReady: "当前使用对象存储，可作为 V1 生产附件留档模式",
      localAccepted: "本地文件存储已被显式批准用于 V1 留档",
      localBlocked: "当前仍是本地文件存储；V1 要求真实 OSS/S3/COS 对象存储",
      objectStorageRisk: "真实 OSS/S3/COS bucket live 尚未作为附件生产留档模式验证通过",
      localRisk: "本地文件存储已被显式批准用于 demo/test；仍需确认备份、磁盘容量、访问权限和运维巡检",
      cleanupRisk: "诊断对象清理未通过，需检查存储删除权限或生命周期策略",
      secretRisk: "附件存储诊断输出疑似暴露密钥字段",
    },
  },
  statementExport: {
    scope: "v1_statement_export_storage_readiness",
    keyPrefix: "statement-export",
    labels: {
      readWrite: "对账导出存储读写诊断",
      cleanup: "对账导出诊断文件清理",
      config: "对账导出存储配置完整性",
      retention: "对账导出生产留档模式",
      redaction: "对账导出密钥脱敏护栏",
    },
    messages: {
      readWriteReady: "诊断导出文件可写、可读且摘要一致",
      readWriteBlocked: "诊断导出文件写入、读回或摘要校验未通过",
      cleanupReady: "诊断导出文件已清理",
      cleanupBlocked: "诊断导出文件未确认清理成功",
      configReady: "当前对账导出存储配置字段完整",
      objectStorageReady: "当前使用对象存储，可作为 V1 生产对账导出留档模式",
      localAccepted: "本地文件存储已被显式批准用于 V1 对账导出留档",
      localBlocked: "当前仍是本地文件存储；V1 要求真实 OSS/S3/COS 对象存储",
      objectStorageRisk: "真实 OSS/S3/COS bucket live 尚未作为对账导出生产留档模式验证通过",
      localRisk: "对账导出本地文件存储已被显式批准用于 demo/test；仍需确认备份、磁盘容量、访问权限和运维巡检",
      cleanupRisk: "对账导出诊断文件清理未通过，需检查存储删除权限或生命周期策略",
      secretRisk: "对账导出存储诊断输出疑似暴露密钥字段",
    },
  },
});

export async function buildAttachmentV1Readiness({
  workspace = {},
  operatorId = "",
  env = process.env,
  now = () => new Date(),
  random = Math.random,
} = {}) {
  const diagnostics = await runAttachmentStorageDiagnostics(workspace.attachmentObjectStorage, { now, random });
  return buildFileRetentionReadiness({
    workspace,
    operatorId,
    env,
    diagnostics,
    profile: retentionProfiles.attachment,
    options: workspace.attachmentV1ReadinessOptions,
    acceptanceEnvKey: "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED",
    acceptanceReferenceEnvKey: "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF",
  });
}

export async function buildStatementExportV1Readiness({
  workspace = {},
  operatorId = "",
  env = process.env,
  now = () => new Date(),
  random = Math.random,
} = {}) {
  const diagnostics = await runStatementExportStorageDiagnostics(workspace.statementExportObjectStorage, { now, random });
  return buildFileRetentionReadiness({
    workspace,
    operatorId,
    env,
    diagnostics,
    profile: retentionProfiles.statementExport,
    options: workspace.statementExportV1ReadinessOptions,
    acceptanceEnvKey: "ERP_STATEMENT_EXPORT_LOCAL_FS_V1_ACCEPTED",
    acceptanceReferenceEnvKey: "ERP_STATEMENT_EXPORT_LOCAL_FS_V1_ACCEPTANCE_REF",
  });
}

export async function runAttachmentStorageDiagnostics(
  attachmentObjectStorage,
  { now = () => new Date(), random = Math.random } = {},
) {
  const checkedAt = now().toISOString();
  const result = createDiagnosticResult(attachmentObjectStorage, checkedAt);
  result.diagnosticAttachmentId = "";
  if (!result.configured) return result;
  if (
    !attachmentObjectStorage ||
    typeof attachmentObjectStorage.putObject !== "function" ||
    typeof attachmentObjectStorage.readObject !== "function"
  ) {
    result.error = {
      code: "ATTACHMENT_STORAGE_DIAGNOSTIC_UNAVAILABLE",
      message: "Attachment object storage adapter is missing required methods.",
    };
    return result;
  }

  const diagnosticAttachmentId = createDiagnosticId("ATT-STORAGE-CHECK", checkedAt, random);
  const diagnosticText = `ERP attachment storage diagnostic ${diagnosticAttachmentId} ${checkedAt}`;
  const contentPayload = { contentType: "text/plain", buffer: Buffer.from(diagnosticText, "utf8") };
  const expectedDigest = digest(contentPayload.buffer);
  result.diagnosticAttachmentId = diagnosticAttachmentId;
  result.expectedDigest = expectedDigest;

  let storedContent = null;
  try {
    storedContent = await attachmentObjectStorage.putObject({
      attachmentId: diagnosticAttachmentId,
      fileName: "storage-diagnostics.txt",
      contentPayload,
    });
    projectStoredContent(result, storedContent);
    const readContent = await attachmentObjectStorage.readObject({
      attachment: {
        attachmentId: diagnosticAttachmentId,
        storageProvider: storedContent?.storageProvider,
        storageKey: storedContent?.storageKey,
        mimeType: contentPayload.contentType,
      },
    });
    projectReadContent(result, readContent, diagnosticText, expectedDigest);
  } catch (error) {
    result.error = diagnosticError("ATTACHMENT_STORAGE_DIAGNOSTIC_FAILED", error, "Attachment storage diagnostic failed.");
  } finally {
    await cleanupDiagnostic({
      result,
      storedContent,
      deleteObject:
        typeof attachmentObjectStorage.deleteObject === "function"
          ? ({ storageKey }) => attachmentObjectStorage.deleteObject({ storageKey })
          : null,
      errorCode: "ATTACHMENT_STORAGE_DIAGNOSTIC_FAILED",
      fallbackMessage: "Attachment storage diagnostic failed.",
    });
  }
  return finalizeDiagnosticResult(result);
}

export async function runStatementExportStorageDiagnostics(
  statementExportObjectStorage,
  { now = () => new Date(), random = Math.random } = {},
) {
  const checkedAt = now().toISOString();
  const result = createDiagnosticResult(statementExportObjectStorage, checkedAt);
  result.diagnosticExportFileId = "";
  if (!result.configured) return result;
  if (
    !statementExportObjectStorage ||
    typeof statementExportObjectStorage.putExportFile !== "function" ||
    typeof statementExportObjectStorage.readExportFile !== "function"
  ) {
    result.error = {
      code: "STATEMENT_EXPORT_STORAGE_DIAGNOSTIC_UNAVAILABLE",
      message: "Statement export object storage adapter is missing required methods.",
    };
    return result;
  }

  const diagnosticExportFileId = createDiagnosticId("DL-STMT-STORAGE-CHECK", checkedAt, random);
  const diagnosticText = `ERP statement export storage diagnostic ${diagnosticExportFileId} ${checkedAt}`;
  const contentBuffer = Buffer.from(diagnosticText, "utf8");
  const expectedDigest = digest(contentBuffer);
  const diagnosticExportFile = {
    exportFileId: diagnosticExportFileId,
    statementId: "ST-STORAGE-DIAGNOSTIC",
    previewType: "storage_diagnostic",
    downloadToken: diagnosticExportFileId,
    fileName: "statement-export-storage-diagnostics.xlsx",
    contentType: STATEMENT_EXCEL_CONTENT_TYPE,
    content: contentBuffer.toString("base64"),
    contentEncoding: "base64",
  };
  result.diagnosticExportFileId = diagnosticExportFileId;
  result.expectedDigest = expectedDigest;

  let storedContent = null;
  try {
    storedContent = await statementExportObjectStorage.putExportFile({ exportFile: diagnosticExportFile });
    projectStoredContent(result, storedContent);
    const readContent = await statementExportObjectStorage.readExportFile({
      exportFile: {
        ...diagnosticExportFile,
        storageProvider: storedContent?.storageProvider,
        storageKey: storedContent?.storageKey,
        contentDigest: storedContent?.contentDigest,
      },
    });
    projectReadContent(result, readContent, diagnosticText, expectedDigest, { normalizeStoredDigest: true });
  } catch (error) {
    result.error = diagnosticError(
      "STATEMENT_EXPORT_STORAGE_DIAGNOSTIC_FAILED",
      error,
      "Statement export storage diagnostic failed.",
    );
  } finally {
    await cleanupDiagnostic({
      result,
      storedContent,
      deleteObject:
        typeof statementExportObjectStorage.deleteExportFile === "function"
          ? ({ storageKey }) => statementExportObjectStorage.deleteExportFile({ storageKey })
          : null,
      errorCode: "STATEMENT_EXPORT_STORAGE_DIAGNOSTIC_FAILED",
      fallbackMessage: "Statement export storage diagnostic failed.",
    });
  }
  return finalizeDiagnosticResult(result);
}

function buildFileRetentionReadiness({
  workspace,
  operatorId,
  env,
  diagnostics,
  profile,
  options = {},
  acceptanceEnvKey,
  acceptanceReferenceEnvKey,
}) {
  const productionRuntime = workspace.runtimeConfig?.mode === "production";
  const declaredAccepted = parseBoolean(options.localFsAccepted ?? env[acceptanceEnvKey]);
  const localFsAcceptance = {
    accepted: declaredAccepted && !productionRuntime,
    declaredAccepted,
    ignoredInProduction: declaredAccepted && productionRuntime,
    reference: text(options.acceptanceReference ?? options.localFsAcceptanceReference ?? env[acceptanceReferenceEnvKey]),
  };
  const storageKind = text(diagnostics.storageKind || diagnostics.storageProvider);
  const storageProvider = text(diagnostics.storageProvider || storageKind);
  const isObjectStorage = storageKind === "object_storage" || storageProvider === "object_storage";
  const isLocalFs = storageKind === "local_fs" || storageProvider === "local_fs";
  const productionRetentionAccepted = isObjectStorage || (isLocalFs && localFsAcceptance.accepted);
  const criteria = buildRetentionCriteria({ diagnostics, profile, productionRetentionAccepted, isObjectStorage, localFsAcceptance });
  const summary = buildSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt: diagnostics.checkedAt || new Date().toISOString(),
    operatorId,
    scope: profile.scope,
    summary,
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    diagnostics: summarizeDiagnostics(diagnostics),
    storageMode: {
      storageKind,
      storageProvider,
      objectStorageLive: isObjectStorage,
      localFsAcceptedForV1: localFsAcceptance.accepted,
      localFsAcceptanceDeclared: localFsAcceptance.declaredAccepted,
      localFsAcceptanceIgnoredInProduction: localFsAcceptance.ignoredInProduction,
      acceptanceReference: localFsAcceptance.reference,
    },
    remainingV1Risks: buildRemainingRisks({ criteria, diagnostics, profile, isObjectStorage, isLocalFs, localFsAcceptance }),
    safeguards: {
      nonMutating: true,
      diagnosticObjectCleanedUp: diagnostics.cleanupOk === true,
      secretFieldsExposed: diagnostics.secretFieldsExposed === true,
      requiresObjectStorageLive: productionRuntime || !localFsAcceptance.accepted,
      localStorageAcceptedForV1: localFsAcceptance.accepted,
      localStorageAcceptanceIgnoredInProduction: localFsAcceptance.ignoredInProduction,
      payloadExposed: false,
    },
  };
}

function buildRetentionCriteria({ diagnostics, profile, productionRetentionAccepted, isObjectStorage, localFsAcceptance }) {
  const { keyPrefix, labels, messages } = profile;
  return [
    criterion({
      key: `${keyPrefix}-storage-diagnostic-readwrite`,
      label: labels.readWrite,
      passed: diagnostics.ready === true,
      detail: diagnostics.ready === true ? messages.readWriteReady : messages.readWriteBlocked,
      evidence: { status: diagnostics.status, writeOk: diagnostics.writeOk, readOk: diagnostics.readOk, digestOk: diagnostics.digestOk },
    }),
    criterion({
      key: `${keyPrefix}-storage-cleanup`,
      label: labels.cleanup,
      passed: diagnostics.cleanupOk === true,
      detail: diagnostics.cleanupOk === true ? messages.cleanupReady : messages.cleanupBlocked,
      evidence: { cleanupOk: diagnostics.cleanupOk },
    }),
    criterion({
      key: `${keyPrefix}-storage-config-complete`,
      label: labels.config,
      passed: diagnostics.configured === true && !diagnostics.missingConfigFields?.length,
      detail:
        diagnostics.configured === true && !diagnostics.missingConfigFields?.length
          ? messages.configReady
          : `缺少配置字段：${(diagnostics.missingConfigFields ?? []).join(" / ") || "未知"}`,
      evidence: { configured: diagnostics.configured, missingConfigFields: diagnostics.missingConfigFields ?? [] },
    }),
    criterion({
      key: `${keyPrefix}-production-retention-mode`,
      label: labels.retention,
      passed: productionRetentionAccepted,
      detail: productionRetentionAccepted
        ? isObjectStorage
          ? messages.objectStorageReady
          : `${messages.localAccepted}：${localFsAcceptance.reference || "未填写引用"}`
        : localFsAcceptance.ignoredInProduction
          ? "production 禁止本地文件留档，风险接受声明已忽略"
          : messages.localBlocked,
      evidence: {
        storageKind: text(diagnostics.storageKind || diagnostics.storageProvider),
        storageProvider: text(diagnostics.storageProvider || diagnostics.storageKind),
        objectStorageLive: isObjectStorage,
        localFsAcceptedForV1: localFsAcceptance.accepted,
        acceptanceReference: localFsAcceptance.reference,
      },
    }),
    criterion({
      key: `${keyPrefix}-storage-redaction`,
      label: labels.redaction,
      passed: diagnostics.secretFieldsExposed !== true,
      detail: diagnostics.secretFieldsExposed === true ? "诊断输出疑似暴露密钥字段" : "诊断输出未暴露密钥字段",
      evidence: { secretFieldsExposed: diagnostics.secretFieldsExposed === true },
    }),
  ];
}

function buildRemainingRisks({ criteria, diagnostics, profile, isObjectStorage, isLocalFs, localFsAcceptance }) {
  const risks = criteria
    .filter((item) => item.blocking && item.status !== "passed")
    .map((item) => `${item.label}：${item.detail}`);
  if (!isObjectStorage && !localFsAcceptance.accepted) risks.push(profile.messages.objectStorageRisk);
  if (isLocalFs && localFsAcceptance.accepted) risks.push(profile.messages.localRisk);
  if (diagnostics.cleanupOk !== true) risks.push(profile.messages.cleanupRisk);
  if (diagnostics.secretFieldsExposed === true) risks.push(profile.messages.secretRisk);
  return [...new Set(risks)].filter(Boolean);
}

function createDiagnosticResult(adapter, checkedAt) {
  const storageKind = text(adapter?.kind);
  const configured = adapter?.configured === false ? false : true;
  return {
    status: configured ? "failed" : "not_configured",
    ready: false,
    checkedAt,
    storageKind,
    storageProvider: text(adapter?.provider || storageKind),
    configured,
    missingConfigFields: Array.isArray(adapter?.missingFields) ? adapter.missingFields.map(String) : [],
    diagnosticStorageKey: "",
    writeOk: false,
    readOk: false,
    digestOk: false,
    cleanupOk: false,
    contentDigest: "",
    expectedDigest: "",
    readDigest: "",
    secretFieldsExposed: false,
  };
}

function projectStoredContent(result, storedContent) {
  result.storageProvider = text(storedContent?.storageProvider || result.storageProvider);
  result.diagnosticStorageKey = text(storedContent?.storageKey);
  result.contentDigest = text(storedContent?.contentDigest);
  result.writeOk = Boolean(result.storageProvider && result.diagnosticStorageKey && result.contentDigest);
}

function projectReadContent(result, readContent, diagnosticText, expectedDigest, { normalizeStoredDigest = false } = {}) {
  if (!Buffer.isBuffer(readContent?.buffer)) return;
  result.readDigest = digest(readContent.buffer);
  result.readOk = readContent.buffer.toString("utf8") === diagnosticText;
  const storedDigest = normalizeStoredDigest ? text(result.contentDigest).replace(/^sha256:/i, "") : result.contentDigest;
  result.digestOk = storedDigest === expectedDigest && result.readDigest === expectedDigest;
}

async function cleanupDiagnostic({ result, storedContent, deleteObject, errorCode, fallbackMessage }) {
  if (!storedContent?.storageKey || typeof deleteObject !== "function") return;
  try {
    await deleteObject({ storageKey: storedContent.storageKey });
    result.cleanupOk = true;
  } catch (error) {
    result.cleanupError = diagnosticError(errorCode, error, fallbackMessage);
  }
}

function finalizeDiagnosticResult(result) {
  result.ready = result.writeOk && result.readOk && result.digestOk;
  result.status = result.ready && result.cleanupOk ? "ok" : result.ready ? "degraded" : "failed";
  return result;
}

function summarizeDiagnostics(diagnostics = {}) {
  return {
    status: text(diagnostics.status),
    ready: diagnostics.ready === true,
    checkedAt: text(diagnostics.checkedAt),
    storageKind: text(diagnostics.storageKind),
    storageProvider: text(diagnostics.storageProvider),
    configured: diagnostics.configured === true,
    missingConfigFields: Array.isArray(diagnostics.missingConfigFields)
      ? diagnostics.missingConfigFields.map(text).filter(Boolean)
      : [],
    writeOk: diagnostics.writeOk === true,
    readOk: diagnostics.readOk === true,
    digestOk: diagnostics.digestOk === true,
    cleanupOk: diagnostics.cleanupOk === true,
    secretFieldsExposed: diagnostics.secretFieldsExposed === true,
  };
}

function criterion({ key, label, passed, detail, evidence }) {
  return { key, label, status: passed ? "passed" : "pending", tone: passed ? "success" : "warning", blocking: true, detail, evidence };
}

function buildSummary(criteria) {
  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const blockingCount = criteria.filter((item) => item.blocking && item.status !== "passed").length;
  return {
    label: `${passedCount}/${criteria.length} 通过`,
    passedCount,
    totalCount: criteria.length,
    blockingCount,
    tone: blockingCount ? "danger" : "success",
  };
}

function createDiagnosticId(prefix, checkedAt, random) {
  const timestamp = checkedAt.replace(/\D/g, "").slice(0, 14);
  const suffix = String(Math.floor(random() * 1000000)).padStart(6, "0");
  return `${prefix}-${timestamp}-${suffix}`;
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function diagnosticError(code, error, fallbackMessage) {
  const message = text(error?.message || fallbackMessage)
    .replace(/(secretAccessKey|accessKeyId|authorization|x-amz-security-token)([^,;\n]*)/gi, "$1=<redacted>")
    .slice(0, 240);
  return { code, message };
}

function parseBoolean(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return ["1", "true", "yes", "y", "accepted", "allow", "allowed"].includes(text(value).toLowerCase());
}

function text(value) {
  return String(value ?? "").trim();
}
