function stringList(value) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function csvCell(value) {
  return `"${stringValue(value).replace(/"/g, '""')}"`;
}

export function sanitizeEnvComment(value) {
  return stringValue(value).replace(/\r?\n/g, " ").replace(/#/g, "＃");
}

export function envTemplateAssignmentGroupsForItem(item) {
  const variables = [...stringList(item?.missingVariables), ...stringList(item?.placeholderVariables)];
  return variables.map(parseEnvVariableGroup).filter((group) => group.assignments.length);
}

function parseEnvVariableGroup(value) {
  const seen = new Set();
  const assignments = [];
  for (const option of stringValue(value).split(/\s+or\s+/i)) {
    for (const assignment of parseEnvVariableOption(option.trim())) {
      if (seen.has(assignment.key)) continue;
      seen.add(assignment.key);
      assignments.push(assignment);
    }
  }
  return { sourceText: stringValue(value), assignments };
}

function parseEnvVariableOption(value) {
  const exactAssignment = parseExactEnvVariableAssignment(value);
  if (exactAssignment) return [exactAssignment];
  return extractEnvVariableAssignments(value);
}

function parseExactEnvVariableAssignment(value) {
  const match = stringValue(value)
    .trim()
    .match(/^([A-Z][A-Z0-9_]*)(?:=([^\s#]+))?$/);
  if (!match) return null;
  const [, key, configuredValue = ""] = match;
  return buildEnvTemplateAssignment(key, configuredValue);
}

function extractEnvVariableAssignments(value) {
  const text = stringValue(value);
  const assignments = [];
  const variablePattern = /\b(?:ERP_[A-Z0-9_]*[A-Z0-9]|VITE_[A-Z0-9_]*[A-Z0-9]|DATABASE_URL|PGURL)\b/g;
  for (const match of text.matchAll(variablePattern)) {
    const key = match[0];
    const rest = text.slice(match.index + key.length);
    const valueMatch = rest.match(/^=([^\s#;]+)/);
    assignments.push(buildEnvTemplateAssignment(key, valueMatch?.[1] || ""));
  }
  return assignments;
}

function buildEnvTemplateAssignment(key, configuredValue = "") {
  const safeLiteral = safeEnvLiteralValue(key, configuredValue);
  return {
    key,
    value: safeLiteral || `<REPLACE_WITH_${key}>`,
    isSafeLiteral: Boolean(safeLiteral),
  };
}

function safeEnvLiteralValue(key, value) {
  const configuredValue = stringValue(value).trim();
  if (!configuredValue) return "";
  if (/^(postgres|object_storage|false|true|command_bridge|cups_lp|s3_compatible)$/i.test(configuredValue)) {
    return configuredValue;
  }
  if (/^\d+$/.test(configuredValue) && /_TIMEOUT_MS$/.test(key)) return configuredValue;
  if (/^\[[\s\S]*\]$/.test(configuredValue) && /_ARGS_JSON$/.test(key) && !/secret|token|pass|key|url/i.test(configuredValue)) {
    return configuredValue;
  }
  return "";
}

function fillRuleForAssignment(assignment) {
  return assignment.isSafeLiteral ? "复制安全字面值并复核" : "填写真实生产值";
}

function sourceSystemForEnvFixItem(key) {
  return (
    {
      "v1-persistence-profile": "PostgreSQL 生产库 / 持久化 profile",
      "postgres-restore-validation-env": "PostgreSQL 专用恢复验证库",
      "attachment-object-storage-env": "附件对象存储 bucket",
      "statement-export-object-storage-env": "对账导出对象存储 bucket",
      "system-printer-command-bridge-env": "办公室打印桥 / 命令桥",
      "cups-preflight-env": "CUPS 真实打印队列",
      "v1-readiness-identity-env": "生产 API / 办公室与司机验收账号",
      "v1-field-acceptance-report-env": "现场验收报告 / 归档目录",
      "local-v1-acceptance-bypass-env": "本地持久化例外签字",
    }[stringValue(key)] || "生产环境配置"
  );
}

function expectedValueTypeForVariable(key, sourceText) {
  const text = `${key} ${sourceText}`;
  if (/DATABASE_URL|POSTGRES/i.test(text)) return "PostgreSQL 连接串";
  if (/ENDPOINT|BASE_URL/i.test(key)) return "http/https URL";
  if (/BUCKET/i.test(key)) return "bucket 名称";
  if (/SECRET_ACCESS_KEY|TOKEN/i.test(key)) return "密钥 / token";
  if (/ACCESS_KEY_ID/i.test(key)) return "access key id";
  if (/ARGS_JSON/i.test(key)) return "JSON array";
  if (/TIMEOUT_MS/i.test(key)) return "正整数毫秒";
  if (/COMMAND$/i.test(key)) return "命令路径或命令名";
  if (/ALLOWLIST|PRINTER/i.test(key)) return "真实设备 / 队列名";
  if (/SPOOL_DIR|OUTPUT_DIR|MANIFEST/i.test(key)) return "安全本地路径 / 归档路径";
  if (/OPERATOR_ID/i.test(key)) return "生产账号 ID";
  if (/PROFILE|ADAPTER|MODE|ENABLED|ACCEPTED|RESET_ALLOWED/i.test(key)) return "固定字面值";
  return "按预检提示填写";
}

export function buildProductionEnvValueIntakeChecklist(fixChecklist, generatedAt) {
  const rows = [];
  for (const item of fixChecklist?.items ?? []) {
    if (!item.missingVariables.length && !item.placeholderVariables.length) continue;
    const fallbackOptionalStatementExport =
      item.key === "statement-export-object-storage-env" && item.configuredVariableCount === 0;
    for (const group of envTemplateAssignmentGroupsForItem(item)) {
      if (!group.assignments.length) continue;
      const alternativeRule =
        group.assignments.length > 1
          ? `任选其一，优先使用 ${group.assignments[0].key}；现场已有标准变量名时才选其它别名`
          : fallbackOptionalStatementExport
            ? "可选独立 bucket；附件对象存储 fallback 完整时本变量组可不填"
            : fillRuleForAssignment(group.assignments[0]);
      const alternativeGroup =
        group.assignments.length > 1 ? group.assignments.map((assignment) => assignment.key).join(" / ") : "";
      for (const assignment of group.assignments) {
        rows.push({
          itemKey: item.key,
          label: item.label,
          ownerRole: item.ownerRole,
          severity: fallbackOptionalStatementExport ? "warning" : item.severity,
          status: fallbackOptionalStatementExport ? "optional_fallback" : item.status,
          variableKey: assignment.key,
          alternativeGroup,
          alternativeRule,
          sourceSystem: sourceSystemForEnvFixItem(item.key),
          expectedValueType: expectedValueTypeForVariable(assignment.key, group.sourceText),
          safeLiteralValue: assignment.isSafeLiteral ? assignment.value : "",
          fillStatus: fallbackOptionalStatementExport
            ? "可选：独立 bucket 才填写"
            : assignment.isSafeLiteral
              ? "复制安全字面值后复核"
              : "待填写真实值",
          verifiedStatus: fallbackOptionalStatementExport ? "附件 fallback 完整后复核" : "待预检",
          evidenceRef: "",
          sourceText: group.sourceText,
          verificationSteps: stringList(item.verificationSteps).join("; "),
          nextAction: fallbackOptionalStatementExport
            ? "优先补齐附件对象存储 fallback；如财务要求独立 bucket，再补齐对账导出独立变量。"
            : item.nextAction,
        });
      }
    }
  }
  return {
    included: fixChecklist?.included === true,
    status: fixChecklist?.ready ? "ready" : rows.length ? "pending_real_values" : "no_missing_env_values",
    ready: fixChecklist?.ready === true && rows.length === 0,
    generatedAt: stringValue(generatedAt),
    rowCount: rows.length,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    rows,
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
    },
  };
}

export function formatProductionEnvValueIntakeCsv(rows) {
  const header = [
    "itemKey", "label", "ownerRole", "severity", "status", "variableKey", "alternativeGroup", "alternativeRule",
    "sourceSystem", "expectedValueType", "safeLiteralValue", "filled", "verified", "evidenceRef", "fillStatus",
    "verifiedStatus", "verificationSteps", "nextAction",
  ];
  const csvRows = (Array.isArray(rows) ? rows : []).map((row) => [
    row.itemKey, row.label, row.ownerRole, row.severity, row.status, row.variableKey, row.alternativeGroup,
    row.alternativeRule, row.sourceSystem, row.expectedValueType, row.safeLiteralValue, "", "", "", row.fillStatus,
    row.verifiedStatus, row.verificationSteps, row.nextAction,
  ]);
  return `${[header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function minimumProductionEnvValueRows(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const minimumRows = [];
  const seenAlternativeGroups = new Set();
  for (const row of sourceRows) {
    if (row.severity !== "blocking" || row.status === "optional_fallback" || row.safeLiteralValue) continue;
    if (row.alternativeGroup) {
      const groupKey = `${row.itemKey}:${row.alternativeGroup}`;
      if (seenAlternativeGroups.has(groupKey)) continue;
      seenAlternativeGroups.add(groupKey);
      const preferredVariable = row.alternativeGroup
        .split(/\s*\/\s*/)
        .map((item) => item.trim())
        .filter(Boolean)[0];
      const preferredRow =
        sourceRows.find(
          (candidate) =>
            candidate.itemKey === row.itemKey &&
            candidate.alternativeGroup === row.alternativeGroup &&
            candidate.variableKey === preferredVariable,
        ) || row;
      minimumRows.push(preferredRow);
      continue;
    }
    minimumRows.push(row);
  }
  return minimumRows;
}

function buildProductionEnvMinimumRowsTargetSignature(rows) {
  return [...new Set(
    rows
      .map((row) => row.alternativeGroup ? `alternative-group:${row.alternativeGroup}` : row.variableKey ? `variable:${row.variableKey}` : "")
      .filter(Boolean),
  )].sort().join("|");
}

export function buildProductionEnvMinimumValueIntakeChecklist(checklist) {
  const rows = minimumProductionEnvValueRows(checklist?.rows);
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_minimum_real_values" : "no_blocking_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    generatedAt: stringValue(checklist?.generatedAt),
    rowCount: rows.length,
    sourceRowCount: numberOrZero(checklist?.rowCount),
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    rows,
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
      onlyBlockingRowsIncluded: true,
      onlyWhitelistedIntakeVariables: true,
      optionalFallbackRowsExcluded: true,
      safeLiteralRowsExcluded: true,
      nonPreferredAliasesExcluded: true,
    },
  };
}

export function buildProductionEnvValuesFragmentTemplate(checklist) {
  const rows = Array.isArray(checklist?.rows) ? checklist.rows : [];
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_real_values_fragment" : "no_missing_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    fileName: "production-env-values-fragment.template.env.example",
    rowCount: rows.length,
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: numberOrZero(checklist?.chooseOneGroupCount),
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
      onlyWhitelistedIntakeVariables: true,
    },
  };
}

export function buildProductionEnvMinimumValuesFragmentTemplate(checklist) {
  const rows = minimumProductionEnvValueRows(checklist?.rows);
  const minimumBlockingTargetSignature = buildProductionEnvMinimumRowsTargetSignature(rows);
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_minimum_real_values_fragment" : "no_blocking_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    fileName: "production-env-minimum-values-fragment.template.env.example",
    rowCount: rows.length,
    sourceRowCount: numberOrZero(checklist?.rowCount),
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    minimumBlockingTargetSignature,
    minimumBlockingTargetSignatureIncluded: Boolean(minimumBlockingTargetSignature),
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
      onlyBlockingRowsIncluded: true,
      onlyWhitelistedIntakeVariables: true,
      optionalFallbackRowsExcluded: true,
      nonPreferredAliasesExcluded: true,
    },
  };
}
