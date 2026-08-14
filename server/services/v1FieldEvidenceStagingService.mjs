import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyV1FieldEvidenceIntakeFromFiles } from "../../scripts/apply-v1-field-evidence-intake.mjs";
import { validateV1FieldEvidenceManifest } from "../../scripts/v1FieldEvidenceManifest.mjs";
import {
  buildV1SignoffBoundarySummaryForStatus,
  parseV1FieldEvidenceMissingItems,
  parseV1FieldEvidenceSignoffBoundaryActions,
  summarizeV1FieldEvidenceIntakeRows,
  summarizeV1FieldEvidenceIntakeSignoffRows,
} from "./v1FieldEvidenceProjectionService.mjs";
import { sanitizeV1FieldEvidenceIntakeDraftManifestResult } from "./v1FieldEvidenceDraftService.mjs";

export function createV1FieldEvidenceStagingService({
  applyIntakeFromFiles = applyV1FieldEvidenceIntakeFromFiles,
  validateManifest = validateV1FieldEvidenceManifest,
  sanitizeDraftManifestResult = sanitizeV1FieldEvidenceIntakeDraftManifestResult,
  getArtifactRoot = defaultArtifactRoot,
  getTemplatePath = defaultTemplatePath,
  now = () => new Date(),
} = {}) {
  requireFunction(applyIntakeFromFiles, "applyIntakeFromFiles");
  requireFunction(validateManifest, "validateManifest");
  requireFunction(sanitizeDraftManifestResult, "sanitizeDraftManifestResult");
  requireFunction(getArtifactRoot, "getArtifactRoot");
  requireFunction(getTemplatePath, "getTemplatePath");
  requireFunction(now, "now");

  return { stageRow };

  function stageRow({ body, operatorId }) {
    const checkedAt = now().toISOString();
    const artifactRoot = getArtifactRoot();
    try {
      const payload = isPlainObject(body) ? body : {};
      const rowType = cleanText(payload.rowType || payload.type || payload.recordType);
      const intakeDir = join(artifactRoot, "v1-field-evidence-intake");
      const stageResult =
        rowType === "evidence"
          ? stageEvidenceCsvRow({
              csvPath: join(intakeDir, "evidence-items.csv"),
              payload,
            })
          : rowType === "signoff" || rowType === "boundary"
            ? stageSignoffBoundaryCsvRow({
                csvPath: join(intakeDir, "signoff-boundary.csv"),
                payload: { ...payload, rowType },
              })
            : stageInvalid(
                "V1_FIELD_EVIDENCE_STAGE_ROW_TYPE_INVALID",
                "rowType 必须是 evidence、signoff 或 boundary。",
              );

      if (!stageResult.ok) {
        return {
          httpStatus: stageResult.httpStatus || 422,
          body: buildStageRowErrorBody({
            checkedAt,
            operatorId,
            error: stageResult.error,
            row: stageResult.row,
          }),
        };
      }

      const evidenceCsvPath = join(intakeDir, "evidence-items.csv");
      const signoffBoundaryCsvPath = join(intakeDir, "signoff-boundary.csv");
      const draftManifestPath = join(intakeDir, "filled-manifest.draft.json");
      const draftResult = applyIntakeFromFiles({
        manifestPath: getTemplatePath(),
        csvPath: evidenceCsvPath,
        signoffBoundaryCsvPath,
        outputPath: draftManifestPath,
        writeOutput: true,
      });
      const draftManifest = sanitizeDraftManifestResult(draftResult, { operatorId, checkedAt });
      const fieldEvidenceCsv = readFileSync(evidenceCsvPath, "utf8");
      const signoffBoundaryCsv = readFileSync(signoffBoundaryCsvPath, "utf8");
      let draftValidation = isPlainObject(draftResult.validation) ? draftResult.validation : {};
      try {
        draftValidation = validateManifest(JSON.parse(readFileSync(draftManifestPath, "utf8")));
      } catch {
        draftValidation = isPlainObject(draftResult.validation) ? draftResult.validation : {};
      }
      const evidenceCloseout = buildEvidenceCloseout(fieldEvidenceCsv, draftValidation);
      const closeout = buildSignoffBoundaryCloseout(signoffBoundaryCsv, draftValidation);
      const invalidRowCount = nonNegativeInteger(draftManifest.summary?.invalidRowCount);
      const ready = draftManifest.ready === true && invalidRowCount === 0;
      return {
        httpStatus: invalidRowCount > 0 ? 422 : 200,
        body: {
          version: "p0-v1-field-evidence-intake-stage-row-v1",
          scope: "v1_field_evidence_intake_stage_row",
          status: invalidRowCount > 0 ? "invalid" : ready ? "ready_draft_written" : "blocked_draft_written",
          ready,
          checkedAt,
          operatorId,
          row: stageResult.row,
          summary: {
            rowType: stageResult.row.type,
            rowLabel: stageResult.row.label,
            rowStatus: stageResult.row.status,
            csvUpdated: true,
            draftWritten: draftManifest.output?.draftWritten === true,
            evidenceProgress: draftManifest.summary?.evidenceProgress || "0/40",
            signoffProgress: draftManifest.summary?.signoffProgress || "0/6",
            boundaryLabel: draftManifest.summary?.boundaryLabel || "待确认",
            invalidRowCount,
            releaseCandidateRefreshed: false,
          },
          evidenceCloseout,
          closeout,
          draftManifest,
          nextAction:
            invalidRowCount > 0
              ? "该行已保存到采集包，但当前 CSV 仍有无效行；按提示修正后重新生成草稿。"
              : ready
                ? "草稿已生成且现场证据 / 签字 / 边界均满足；下一步用刷新预检确认能否刷新 release candidate。"
                : "草稿行已保存并生成 draft manifest；继续补齐剩余现场证据、负责人签字和 V1/V2 边界。",
          safeguards: buildStageRowSafeguards({
            csvUpdated: true,
            draftWritten: draftManifest.output?.draftWritten === true,
          }),
        },
      };
    } catch {
      return {
        httpStatus: 400,
        body: buildStageRowErrorBody({
          checkedAt,
          operatorId,
          error: {
            code: "V1_FIELD_EVIDENCE_STAGE_ROW_FAILED",
            message: "现场证据草稿行保存失败：采集包 CSV 或 manifest 模板缺失 / 不可读。",
          },
        }),
      };
    }
  }
}

function buildStageRowErrorBody({ checkedAt, operatorId, error = {}, row = null } = {}) {
  return {
    version: "p0-v1-field-evidence-intake-stage-row-v1",
    scope: "v1_field_evidence_intake_stage_row",
    status: "invalid",
    ready: false,
    checkedAt: checkedAt || new Date().toISOString(),
    operatorId,
    error: {
      code: cleanText(error.code) || "V1_FIELD_EVIDENCE_STAGE_ROW_INVALID",
      message: cleanText(error.message) || "现场证据草稿行无效。",
    },
    row,
    summary: {
      rowType: row?.type || "",
      rowLabel: row?.label || "",
      rowStatus: row?.status || "",
      csvUpdated: false,
      draftWritten: false,
      evidenceProgress: "0/40",
      signoffProgress: "0/6",
      boundaryLabel: "待确认",
      invalidRowCount: 1,
      releaseCandidateRefreshed: false,
    },
    draftManifest: null,
    nextAction: "按页面提示补齐状态、证据编号、签字人和时间后再保存草稿行。",
    safeguards: buildStageRowSafeguards({ csvUpdated: false, draftWritten: false }),
  };
}

function buildSignoffBoundaryCloseout(signoffBoundaryCsv = "", fallback = {}) {
  const signoffSummary = summarizeV1FieldEvidenceIntakeSignoffRows(signoffBoundaryCsv);
  const validationSummary = isPlainObject(fallback.summary) ? fallback.summary : {};
  const validationBoundary = isPlainObject(fallback.boundary) ? fallback.boundary : null;
  const validationSignoffRows = nonNegativeInteger(validationSummary.requiredSignoffsTotal);
  const validationCompletedSignoffRows = nonNegativeInteger(validationSummary.requiredSignoffsCompleted);
  const signoffRows = validationSignoffRows || signoffSummary.signoffRows;
  const completedSignoffRows = validationSignoffRows
    ? validationCompletedSignoffRows
    : signoffSummary.completedSignoffRows;
  const boundaryReady = validationBoundary ? validationBoundary.blocking === false : signoffSummary.boundaryReady;
  const boundaryStatus = validationBoundary
    ? cleanText(validationBoundary.status) || "pending"
    : signoffSummary.boundaryStatus;
  const boundaryLabel = boundaryReady ? "已确认" : boundaryStatus === "blocked" ? "已阻塞" : "待确认";
  const signoffBoundaryActions = parseV1FieldEvidenceSignoffBoundaryActions(signoffBoundaryCsv, fallback);
  const missingSignoffRows = Math.max(0, signoffRows - completedSignoffRows);
  const actionCount =
    nonNegativeInteger(signoffBoundaryActions.totalCount) ||
    missingSignoffRows + (boundaryReady ? 0 : 1);
  const ready =
    signoffRows > 0 &&
    missingSignoffRows === 0 &&
    boundaryReady &&
    signoffSummary.invalidSignoffRows === 0;
  const actions = signoffBoundaryActions.items.slice(0, 5);
  const signoffBoundarySummary = buildV1SignoffBoundarySummaryForStatus({
    boundary: { ready: boundaryReady, status: boundaryStatus },
    actions,
    actionCount,
    actionShownCount: actions.length,
    requiredSignoffsTotal: signoffRows,
    requiredSignoffsCompleted: completedSignoffRows,
  });
  return {
    status: ready ? "ready" : "blocked",
    ready,
    signoffProgress: `${completedSignoffRows}/${signoffRows}`,
    missingSignoffRows,
    invalidSignoffRows: signoffSummary.invalidSignoffRows,
    boundaryStatus,
    boundaryLabel,
    boundaryReady,
    actionCount,
    actionShownCount: actions.length,
    actions,
    signoffBoundarySummary,
    nextAction: ready
      ? "签字和 V1/V2 边界草稿已满足；继续校验证据草稿和刷新预检。"
      : missingSignoffRows > 0
        ? `还差 ${missingSignoffRows} 个负责人签字；先处理下方签字/边界待办。`
        : boundaryReady
          ? "签字 / 边界仍有无效行；按提示补齐人员和时间后再保存。"
          : "负责人确认 V1 必做项和 V2 延后项后，补齐 V1/V2 边界确认人和时间。",
    safeguards: {
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

function buildEvidenceCloseout(fieldEvidenceCsv = "", fallback = {}) {
  const evidenceSummary = summarizeV1FieldEvidenceIntakeRows(fieldEvidenceCsv);
  const validationSummary = isPlainObject(fallback.summary) ? fallback.summary : {};
  const validationRequiredEvidenceRows = nonNegativeInteger(validationSummary.requiredEvidenceItemsTotal);
  const validationCompletedEvidenceRows = nonNegativeInteger(validationSummary.requiredEvidenceItemsCompleted);
  const requiredEvidenceRows = validationRequiredEvidenceRows || evidenceSummary.requiredEvidenceRows;
  const completedEvidenceRows = validationRequiredEvidenceRows
    ? validationCompletedEvidenceRows
    : evidenceSummary.completedEvidenceRows;
  const missingItems = parseV1FieldEvidenceMissingItems(fieldEvidenceCsv, fallback);
  const missingEvidenceRows = Math.max(0, requiredEvidenceRows - completedEvidenceRows);
  const actionCount = nonNegativeInteger(missingItems.totalCount) || missingEvidenceRows;
  const ready =
    requiredEvidenceRows > 0 &&
    missingEvidenceRows === 0 &&
    evidenceSummary.invalidEvidenceRows === 0;
  const actions = missingItems.items.slice(0, 5);
  return {
    status: ready ? "ready" : "blocked",
    ready,
    evidenceProgress: `${completedEvidenceRows}/${requiredEvidenceRows}`,
    requiredEvidenceRows,
    completedEvidenceRows,
    filledEvidenceRows: evidenceSummary.filledEvidenceRows,
    missingEvidenceRows,
    invalidEvidenceRows: evidenceSummary.invalidEvidenceRows,
    blockedEvidenceRows: evidenceSummary.blockedEvidenceRows,
    notApplicableEvidenceRows: evidenceSummary.notApplicableEvidenceRows,
    actionCount,
    actionShownCount: actions.length,
    actions,
    nextAction: ready
      ? "现场证据草稿已满足；继续补负责人签字、V1/V2 边界并刷新预检。"
      : evidenceSummary.invalidEvidenceRows > 0
        ? `还有 ${evidenceSummary.invalidEvidenceRows} 条证据行状态和证据编号不匹配；按提示修正后再保存。`
        : missingEvidenceRows > 0
          ? `还差 ${missingEvidenceRows} 条现场证据；先处理下方证据待办。`
          : "现场证据仍有阻塞项；按证据待办补材料或确认状态。",
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

function buildStageRowSafeguards({ csvUpdated = false, draftWritten = false } = {}) {
  return {
    csvUpdated: Boolean(csvUpdated),
    draftManifestWritten: Boolean(draftWritten),
    sourceManifestMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawCsvIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function stageEvidenceCsvRow({ csvPath, payload }) {
  const groupKey = cleanText(payload.groupKey);
  const itemKey = cleanText(payload.itemKey);
  const onsiteStatus = cleanText(payload.onsiteStatus || payload.status || "pending");
  const onsiteEvidenceRef = cleanStageValue(payload.onsiteEvidenceRef);
  const onsiteNotes = cleanStageValue(payload.onsiteNotes);
  if (!groupKey || !itemKey) {
    return stageInvalid("V1_FIELD_EVIDENCE_STAGE_EVIDENCE_KEY_MISSING", "必须选择现场证据项。");
  }
  if (!["pending", "passed", "accepted", "blocked", "not_applicable"].includes(onsiteStatus)) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_EVIDENCE_STATUS_INVALID",
      "证据状态只能是 pending、passed、accepted、blocked 或 not_applicable。",
    );
  }
  if (["passed", "accepted"].includes(onsiteStatus) && !onsiteEvidenceRef) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_EVIDENCE_REF_REQUIRED",
      "passed / accepted 必须填写证据编号、截图文件名或内部归档编号。",
    );
  }
  if (hasSensitiveMarker(onsiteEvidenceRef) || hasSensitiveMarker(onsiteNotes)) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_SENSITIVE_VALUE",
      "草稿行不能包含连接串、密钥、命令路径、spool 路径或 token。",
    );
  }
  const csv = readMutableCsv(csvPath);
  const rowIndex = csv.rows.findIndex(
    (row) => cleanText(row.groupKey) === groupKey && cleanText(row.itemKey) === itemKey,
  );
  if (rowIndex < 0) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_EVIDENCE_ROW_NOT_FOUND",
      "采集包里找不到该证据项，请先刷新现场证据采集包。",
    );
  }
  const row = csv.rows[rowIndex];
  row.onsiteStatus = onsiteStatus;
  row.onsiteEvidenceRef = onsiteEvidenceRef;
  row.onsiteNotes = onsiteNotes;
  writeMutableCsv(csvPath, csv);
  return {
    ok: true,
    row: {
      type: "evidence",
      row: rowIndex + 2,
      key: itemKey,
      groupKey,
      itemKey,
      groupLabel: cleanText(row.groupLabel),
      label: cleanText(row.itemLabel),
      ownerRole: cleanText(row.ownerRole),
      status: onsiteStatus,
      evidenceRefFilled: Boolean(onsiteEvidenceRef),
      notesFilled: Boolean(onsiteNotes),
    },
  };
}

function stageSignoffBoundaryCsvRow({ csvPath, payload }) {
  const rowType = cleanText(payload.rowType);
  const role = cleanText(payload.role || (rowType === "boundary" ? "v1_v2_boundary" : ""));
  const onsiteStatus = cleanText(payload.onsiteStatus || payload.status || "pending");
  const onsiteSigner = cleanStageValue(payload.onsiteSigner);
  const onsiteSignedAt = cleanStageValue(payload.onsiteSignedAt);
  const onsiteConfirmedBy = cleanStageValue(payload.onsiteConfirmedBy);
  const onsiteConfirmedAt = cleanStageValue(payload.onsiteConfirmedAt);
  const onsiteNotes = cleanStageValue(payload.onsiteNotes);
  if (!role) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_SIGNOFF_ROLE_MISSING",
      "必须选择签字角色或边界确认项。",
    );
  }
  if (rowType === "signoff" && !["pending", "signed", "accepted", "blocked"].includes(onsiteStatus)) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_SIGNOFF_STATUS_INVALID",
      "签字状态只能是 pending、signed、accepted 或 blocked。",
    );
  }
  if (rowType === "boundary" && !["pending", "confirmed", "blocked"].includes(onsiteStatus)) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_BOUNDARY_STATUS_INVALID",
      "边界状态只能是 pending、confirmed 或 blocked。",
    );
  }
  if (rowType === "signoff" && ["signed", "accepted"].includes(onsiteStatus) && (!onsiteSigner || !onsiteSignedAt)) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_SIGNOFF_FIELDS_REQUIRED",
      "signed / accepted 必须填写签字人和签字时间。",
    );
  }
  if (rowType === "boundary" && onsiteStatus === "confirmed" && (!onsiteConfirmedBy || !onsiteConfirmedAt)) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_BOUNDARY_FIELDS_REQUIRED",
      "confirmed 必须填写确认人和确认时间。",
    );
  }
  if (
    hasSensitiveMarker(onsiteSigner) ||
    hasSensitiveMarker(onsiteSignedAt) ||
    hasSensitiveMarker(onsiteConfirmedBy) ||
    hasSensitiveMarker(onsiteConfirmedAt) ||
    hasSensitiveMarker(onsiteNotes)
  ) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_SENSITIVE_VALUE",
      "草稿行不能包含连接串、密钥、命令路径、spool 路径或 token。",
    );
  }
  const csv = readMutableCsv(csvPath);
  const rowIndex = csv.rows.findIndex(
    (row) => cleanText(row.recordType) === rowType && cleanText(row.role) === role,
  );
  if (rowIndex < 0) {
    return stageInvalid(
      "V1_FIELD_EVIDENCE_STAGE_SIGNOFF_ROW_NOT_FOUND",
      "采集包里找不到该签字或边界确认项，请先刷新现场证据采集包。",
    );
  }
  const row = csv.rows[rowIndex];
  row.onsiteStatus = onsiteStatus;
  row.onsiteNotes = onsiteNotes;
  if (rowType === "signoff") {
    row.onsiteSigner = onsiteSigner;
    row.onsiteSignedAt = onsiteSignedAt;
  } else {
    row.onsiteConfirmedBy = onsiteConfirmedBy;
    row.onsiteConfirmedAt = onsiteConfirmedAt;
  }
  writeMutableCsv(csvPath, csv);
  return {
    ok: true,
    row: {
      type: rowType,
      row: rowIndex + 2,
      key: role,
      role,
      label: cleanText(row.label || role),
      status: onsiteStatus,
      personFilled: rowType === "boundary" ? Boolean(onsiteConfirmedBy) : Boolean(onsiteSigner),
      timeFilled: rowType === "boundary" ? Boolean(onsiteConfirmedAt) : Boolean(onsiteSignedAt),
      notesFilled: Boolean(onsiteNotes),
    },
  };
}

function stageInvalid(code, message) {
  return { ok: false, httpStatus: 422, error: { code, message }, row: null };
}

function cleanStageValue(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim().slice(0, 160);
}

function hasSensitiveMarker(value) {
  return /postgres:\/\/|mysql:\/\/|mongodb:\/\/|AKIA[0-9A-Z_]{8,}|secret|password|passwd|access[_-]?key|\/var\/spool|\/usr\/bin\/lp|token/i.test(
    String(value || ""),
  );
}

function readMutableCsv(path) {
  const records = parseMutableCsvRecords(readFileSync(path, "utf8"));
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((header) => cleanText(header));
  const rows = records
    .slice(1)
    .filter((record) => record.some((entry) => cleanText(entry)))
    .map((record) => {
      const row = {};
      headers.forEach((header, index) => {
        if (header) row[header] = cleanText(record[index]);
      });
      return row;
    });
  return { headers, rows };
}

function writeMutableCsv(path, csv) {
  const lines = [
    csv.headers.map(formatMutableCsvCell).join(","),
    ...csv.rows.map((row) => csv.headers.map((header) => formatMutableCsvCell(row[header] ?? "")).join(",")),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function parseMutableCsvRecords(text) {
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < String(text || "").length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

function formatMutableCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function defaultArtifactRoot() {
  return process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT
    ? resolve(process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT)
    : join(process.cwd(), ".erp-local-storage");
}

function defaultTemplatePath() {
  return join(process.cwd(), "docs", "development", "v1-field-evidence-manifest.template.json");
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
