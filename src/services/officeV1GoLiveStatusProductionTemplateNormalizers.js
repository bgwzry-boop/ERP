import {
  cleanText,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

export function normalizeProductionEnvFixChecklist(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const configuredVariableCount = Number(summary.configuredVariableCount) || items.reduce((total, item) => total + item.configuredVariableCount, 0);
  const totalVariableCount = Number(summary.totalVariableCount) || items.reduce((total, item) => total + item.totalVariableCount, 0);
  return {
    status: cleanText(source.status) || (items.some((item) => item.severity === "blocking") ? "blocked" : "passed"),
    ready: source.ready === true,
    summary: {
      label: cleanText(summary.label) || (items.length ? `生产环境修正清单：${items.length} 项` : ""),
      itemCount: Number(summary.itemCount) || items.length,
      blockingCount: Number(summary.blockingCount) || items.filter((item) => item.severity === "blocking").length,
      warningCount: Number(summary.warningCount) || items.filter((item) => item.severity === "warning").length,
      passedCount: Number(summary.passedCount) || items.filter((item) => item.status === "passed").length,
      configuredVariableCount,
      totalVariableCount,
      configuredLabel: `${configuredVariableCount}/${totalVariableCount}`,
    },
    items,
  };
}
export function normalizeProductionEnvFixItem(value = {}) {
  const requiredVariables = normalizeStringList(value?.requiredVariables);
  const missingVariables = normalizeStringList(value?.missingVariables);
  const placeholderVariables = normalizeStringList(value?.placeholderVariables);
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    severity: cleanText(value?.severity) || "warning",
    status: cleanText(value?.status),
    ready: value?.ready === true,
    blocking: value?.blocking === true,
    configuredVariableCount: Number(value?.configuredVariableCount) || 0,
    totalVariableCount: Number(value?.totalVariableCount) || 0,
    requiredVariables,
    missingVariables,
    placeholderVariables,
    valueGuidance: normalizeStringList(value?.valueGuidance),
    verificationSteps: normalizeStringList(value?.verificationSteps),
    variableLabel: missingVariables.length
      ? missingVariables.join("、")
      : requiredVariables.slice(0, 3).join("、"),
    nextAction: cleanText(value?.nextAction),
  };
}

export function normalizeProductionEnvFillTemplate(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const variableNames = normalizeStringList(source.variableNames);
  const previewLines = Array.isArray(source.previewLines)
    ? source.previewLines.map((line) => cleanText(line))
    : [];
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    available: cleanText(source.status) === "available" && previewLines.some((line) => line !== ""),
    summary: {
      label: cleanText(summary.label),
      lineCount: Number(summary.lineCount) || previewLines.length,
      variableCount: Number(summary.variableCount) || variableNames.length,
      placeholderCount: Number(summary.placeholderCount) || previewLines.filter((line) => line.includes("<待填写>")).length,
      blockingSectionCount: Number(summary.blockingSectionCount) || 0,
      warningSectionCount: Number(summary.warningSectionCount) || 0,
      templateKind: cleanText(summary.templateKind),
      fileName: cleanText(summary.fileName),
      targetLabel: cleanText(summary.targetLabel),
      commandLineCount: Number(summary.commandLineCount) || 0,
    },
    variableNames,
    previewLines,
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}
