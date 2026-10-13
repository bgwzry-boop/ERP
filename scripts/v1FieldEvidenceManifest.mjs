export const manifestSchema = "erp-v1-field-evidence-manifest-v2";
export const manifestGeneratedAt = "2026-07-04T00:00:00.000+08:00";

const completionItemStatuses = new Set(["passed", "accepted"]);
const completionSignoffStatuses = new Set(["signed", "accepted"]);
const knownItemStatuses = new Set(["pending", "passed", "accepted", "blocked", "not_applicable"]);
const knownSignoffStatuses = new Set(["pending", "signed", "accepted", "blocked"]);
const knownBoundaryStatuses = new Set(["pending", "confirmed", "blocked"]);

export const requiredEvidenceGroupKeys = [
  "production_persistence",
  "object_storage",
  "print_hardware",
  "driver_native_device",
  "business_workflow_pilot",
  "payroll_attendance_pilot",
  "security_operations",
];

export const requiredSignoffRoles = ["办公室", "仓库/出库", "车间", "司机", "财务", "技术/管理"];

export function buildV1FieldEvidenceManifestTemplate() {
  return {
    schema: manifestSchema,
    updatedAt: manifestGeneratedAt,
    environment: {
      releaseCandidateReport: ".erp-local-storage/v1-release-candidate/latest.md",
      apiBaseUrl: "",
      productionEnvPreflightReport: "",
      runtimeReadinessReport: "",
      fieldAcceptanceReport: "",
    },
    evidenceGroups: [
      buildGroup("production_persistence", "生产持久化", "技术 / 管理", [
        ["postgres_migration_applied", "PostgreSQL 迁移已在生产库执行"],
        ["postgres_backup_configured", "生产库备份策略和负责人已确认"],
        ["postgres_restore_sample_checked", "恢复演练或恢复样本已留档"],
        ["postgres_roles_checked", "生产库账号、最小权限和连接池配置已确认"],
        ["production_env_preflight_10_of_10", "V1 生产环境变量预检已达到 10/10"],
      ]),
      buildGroup("object_storage", "对象存储 / 附件留档", "技术 / 财务", [
        ["attachment_bucket_policy_checked", "附件 bucket 权限、生命周期和备份策略已确认"],
        ["attachment_upload_readback_checked", "附件上传、读回和内容摘要一致性已通过"],
        ["attachment_signed_url_checked", "附件短期访问地址可读取且过期策略已验证"],
        ["attachment_access_audit_checked", "附件访问审计已写入并可查询"],
        ["statement_export_storage_checked", "对账导出文件已写入对象存储并可重新下载"],
      ]),
      buildGroup("print_hardware", "打印硬件 / CUPS / 标签", "办公室 / 仓库", [
        ["cups_lpstat_checked", "真实 CUPS 队列 non-printing 预检已通过"],
        ["label_sample_printed", "标签机真实样张已出纸并留档"],
        ["dot_matrix_sample_printed", "针式单据真实样张已出纸并留档"],
        ["paper_alignment_checked", "标签纸 / 针式纸对位和尺寸已确认"],
        ["barcode_scan_checked", "打印条码可被扫码设备读取并匹配包裹"],
        ["spool_or_driver_callback_checked", "spool 状态或驱动回写已确认"],
        ["void_reprint_checked", "作废重打流程已用真实设备验证"],
      ]),
      buildGroup("driver_native_device", "司机真机 / 原生壳", "司机 / 技术", [
        ["driver_real_phone_checked", "真实 Android / iOS 手机已安装并登录"],
        ["camera_permission_checked", "相机权限、拍照和水印信息已通过"],
        ["native_package_scan_checked", "纸质包裹标签原生扫码已匹配任务"],
        ["geo_location_checked", "定位权限和送达位置记录已通过"],
        ["map_navigation_checked", "地图导航桥接可打开并到达正确地址"],
        ["offline_upload_fallback_checked", "弱网或失败上传兜底流程已确认"],
      ]),
      buildGroup("business_workflow_pilot", "真实业务试运行", "办公室 / 仓库 / 财务", [
        ["real_order_entry_checked", "真实客户订单录入、识别和确认已通过"],
        ["real_inventory_reservation_checked", "真实库存占用、释放和缺货提示已通过"],
        ["real_fulfillment_checked", "真实出库、交付、异常和重打流程已通过"],
        ["real_production_packing_checked", "真实生产 / 打包任务和成品图复核已通过"],
        ["real_statement_payment_checked", "真实对账、收款、差额和核销流程已通过"],
        ["exception_todo_checked", "异常待办责任人、提醒和处理闭环已确认"],
      ]),
      buildGroup("payroll_attendance_pilot", "工资 / 考勤真实闭环", "财务 / 管理", [
        ["employee_payroll_profile_coverage_checked", "全部在职员工档案、计薪基础和得力身份映射已通过严格预检"],
        ["deli_attendance_first_sync_checked", "得力初始化、首次只读同步和稳定员工映射已核对"],
        ["closed_month_attendance_review_checked", "完整自然月考勤已导入且未匹配身份和异常均已清零"],
        ["payroll_policy_version_approved", "首月正式计薪规则已由负责人审批并发布生效版本"],
        ["payroll_closeout_checked", "首期工资草稿、会计复核、管理锁定、不可变导出和发薪确认已闭环"],
        ["employee_self_service_checked", "正式员工账号只能查看本人打卡、工时、月度预估和历史工资"],
      ]),
      buildGroup("security_operations", "账号 / 权限 / 运维", "技术 / 管理", [
        ["production_users_checked", "生产用户、岗位、角色和禁用名单已确认"],
        ["password_reset_plan_checked", "初始密码、强制改密、重置和撤销流程已确认"],
        ["audit_log_retention_checked", "操作日志和访问审计留存策略已确认"],
        ["backup_monitoring_checked", "备份巡检、容量监控和告警负责人已确认"],
        ["rollback_owner_checked", "回滚窗口、回滚负责人和沟通路径已确认"],
      ]),
    ],
    signoffs: requiredSignoffRoles.map((role) => ({
      role,
      required: true,
      signer: "",
      signedAt: "",
      status: "pending",
      notes: "",
    })),
    v1V2BoundaryConfirmed: {
      v1: [
        "核心 ERP 闭环、人工确认、生产级持久化、真实打印、司机真机、对象存储和现场 QA。",
        "正式员工档案、得力考勤身份与完整自然月工资闭环，以及员工本人考勤和历史工资查询。",
        "客户通知、成品图确认、异常处理和对账发送仍以人工确认闭环为主。",
      ],
      v2: [
        "企业微信自动发送、自动回执抓取、AI/OCR、路线优化、自动排产、原材料成本毛利、售后责任与绩效扣款和 BI 深化。",
      ],
      confirmedBy: "",
      confirmedAt: "",
      status: "pending",
    },
  };
}

export function serializeManifestJson(manifest = buildV1FieldEvidenceManifestTemplate()) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildV1FieldEvidenceChecklistMarkdown(manifest = buildV1FieldEvidenceManifestTemplate()) {
  const lines = [
    "# ERP V1 现场证据清单",
    "",
    "最后更新：2026-07-04",
    "",
    "## 使用方式",
    "",
    "1. 复制 `docs/development/v1-field-evidence-manifest.template.json` 到安全的、不会提交真实敏感信息的位置。旧 `erp-v1-field-evidence-manifest-v1` 草稿先用升级命令生成新的 v2 文件；升级不会覆盖旧文件，新增工资/考勤证据保持待填，旧签字和 V1/V2 边界必须按扩大后的 V1 范围重新确认。",
    "2. 生成 `.erp-local-storage/v1-field-evidence-intake/` 采集包，先阅读 `intake-rules.zh-CN.md`，再填写 `evidence-items.csv` 和 `signoff-boundary.csv`。",
    "3. 只在证据字段填证据编号、工单号、截图文件名、报告路径或现场签字单编号；不要填数据库连接串、对象存储密钥、命令路径、spool 路径或客户隐私原文。",
    "4. 每个必填项必须改成 `passed` 或 `accepted` 并填写证据编号；所有负责人签字、V1/V2 边界确认完成后再跑校验和 release candidate。",
    "",
    "```bash",
    "node scripts/upgrade-v1-field-evidence-manifest.mjs --input <legacy-v1.json> --output <new-v2.json>",
    "node scripts/run-v1-field-evidence-intake-pack.mjs --manifest <current-manifest> --output-dir .erp-local-storage/v1-field-evidence-intake",
    "node scripts/apply-v1-field-evidence-intake.mjs --manifest <current-manifest> --csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --output .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json",
    "node scripts/validate-v1-field-evidence-manifest.mjs --manifest .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json",
    "node scripts/run-v1-release-candidate-check.mjs --use-production-env-setup-env-file --field-evidence-manifest .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json --api-base-url https://<erp-host>/api",
    "node scripts/run-v1-go-live-suite.mjs --refresh-release-candidate --use-production-env-setup-env-file --field-evidence-manifest <current-manifest> --field-evidence-intake-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --field-evidence-signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --field-evidence-draft-output .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json --output-root .erp-local-storage/v1-go-live-suite --sync-canonical-latest",
    "```",
    "",
    "## 现场证据项",
    "",
  ];

  for (const group of manifest.evidenceGroups) {
    lines.push(`### ${group.label}`);
    lines.push("");
    lines.push(`负责人：${group.ownerRole}`);
    lines.push("");
    lines.push("| 证据项 | 必填 | 状态 | evidenceRef | 备注 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const item of group.items) {
      lines.push(`| ${item.label} | ${item.required ? "是" : "否"} | ${item.status} | ${item.evidenceRef || "待填"} | ${item.notes || ""} |`);
    }
    lines.push("");
  }

  lines.push("## 负责人签字");
  lines.push("");
  lines.push("| 角色 | 必填 | 状态 | 签字人 | 签字时间 | 备注 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const signoff of manifest.signoffs) {
    lines.push(`| ${signoff.role} | ${signoff.required ? "是" : "否"} | ${signoff.status} | ${signoff.signer || "待填"} | ${signoff.signedAt || "待填"} | ${signoff.notes || ""} |`);
  }
  lines.push("");
  lines.push("## V1 / V2 边界确认");
  lines.push("");
  lines.push("- V1：");
  for (const item of manifest.v1V2BoundaryConfirmed.v1) lines.push(`  - ${item}`);
  lines.push("- V2：");
  for (const item of manifest.v1V2BoundaryConfirmed.v2) lines.push(`  - ${item}`);
  lines.push("- 边界确认状态：`pending`，需要改为 `confirmed` 并填写确认人和确认时间。");
  lines.push("");
  lines.push("## 禁止误判");
  lines.push("");
  lines.push("- 清单生成不等于验收通过；模板里所有证据默认都是 `pending`。");
  lines.push("- 自动化 `11/11`、fake CUPS 和本地对象存储不能替代真实生产环境、真实打印机和司机真机。");
  lines.push("- 校验器默认 blocked 时退出码为 `2`，用于阻止误上线。");
  lines.push("");
  return `${lines.join("\n")}`;
}

export function buildGeneratorSummary({ outputJsonPath, outputMarkdownPath } = {}) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  const requiredItems = manifest.evidenceGroups.flatMap((group) => group.items).filter((item) => item.required);
  return {
    scope: "v1_field_evidence_manifest_template",
    status: "ready",
    schema: manifestSchema,
    outputs: {
      jsonTemplate: outputJsonPath || "docs/development/v1-field-evidence-manifest.template.json",
      markdownChecklist: outputMarkdownPath || "docs/development/v1-field-evidence-checklist.zh-CN.md",
    },
    summary: {
      evidenceGroupCount: manifest.evidenceGroups.length,
      requiredEvidenceItemCount: requiredItems.length,
      requiredSignoffCount: manifest.signoffs.length,
    },
    safeguards: {
      templateContainsRealSecrets: false,
      allRequiredEvidenceDefaultsPending: requiredItems.every((item) => item.status === "pending" && !item.evidenceRef),
      signoffsDefaultPending: manifest.signoffs.every((signoff) => signoff.status === "pending" && !signoff.signer),
    },
  };
}

export function validateV1FieldEvidenceManifest(manifest) {
  const schemaErrors = validateManifestShape(manifest);
  if (schemaErrors.length > 0) {
    return {
      scope: "v1_field_evidence_manifest_validation",
      status: "invalid",
      ready: false,
      schemaValid: false,
      schemaErrors,
      summary: emptySummary(),
      groups: [],
      blockers: schemaErrors.map((message) => ({ type: "schema", key: "manifest", label: message, reason: message })),
      safeguards: {
        evidenceRefsRedacted: true,
        possibleSensitiveEvidenceRefCount: 0,
      },
    };
  }

  const groups = manifest.evidenceGroups.map(validateGroup);
  const signoffs = manifest.signoffs.map(validateSignoff);
  const boundary = validateBoundary(manifest.v1V2BoundaryConfirmed);
  const blockers = [
    ...groups.flatMap((group) => group.blockers),
    ...signoffs.filter((signoff) => signoff.blocking).map((signoff) => ({
      type: "signoff",
      key: signoff.role,
      label: signoff.role,
      status: signoff.status,
      reason: signoff.reason,
    })),
  ];
  if (boundary.blocking) {
    blockers.push({
      type: "v1_v2_boundary",
      key: "v1_v2_boundary",
      label: "V1 / V2 边界确认",
      status: boundary.status,
      reason: boundary.reason,
    });
  }

  const totalRequiredItems = groups.reduce((sum, group) => sum + group.requiredTotal, 0);
  const completedRequiredItems = groups.reduce((sum, group) => sum + group.completedRequired, 0);
  const totalRequiredSignoffs = signoffs.filter((signoff) => signoff.required).length;
  const completedRequiredSignoffs = signoffs.filter((signoff) => signoff.required && !signoff.blocking).length;
  const ready = blockers.length === 0;

  return {
    scope: "v1_field_evidence_manifest_validation",
    status: ready ? "ready" : "blocked",
    ready,
    schemaValid: true,
    checkedAt: new Date().toISOString(),
    summary: {
      label: ready
        ? "V1 现场证据清单已通过"
        : `V1 现场证据清单仍阻塞：证据 ${completedRequiredItems}/${totalRequiredItems}，签字 ${completedRequiredSignoffs}/${totalRequiredSignoffs}`,
      evidenceGroupsTotal: groups.length,
      evidenceGroupsReady: groups.filter((group) => group.ready).length,
      requiredEvidenceItemsTotal: totalRequiredItems,
      requiredEvidenceItemsCompleted: completedRequiredItems,
      requiredSignoffsTotal: totalRequiredSignoffs,
      requiredSignoffsCompleted: completedRequiredSignoffs,
      blockingCount: blockers.length,
    },
    environment: {
      releaseCandidateReportConfigured: Boolean(String(manifest.environment?.releaseCandidateReport || "").trim()),
      apiBaseUrlConfigured: Boolean(String(manifest.environment?.apiBaseUrl || "").trim()),
      reportRefsConfigured: [
        "productionEnvPreflightReport",
        "runtimeReadinessReport",
        "fieldAcceptanceReport",
      ].filter((key) => Boolean(String(manifest.environment?.[key] || "").trim())).length,
    },
    groups: groups.map(({ blockers: _blockers, ...group }) => group),
    signoffs,
    boundary,
    blockers,
    safeguards: {
      evidenceRefsRedacted: true,
      possibleSensitiveEvidenceRefCount: countSensitiveEvidenceRefs(manifest),
      rawEvidenceRefsIncludedInReport: false,
    },
  };
}

function buildGroup(key, label, ownerRole, items) {
  return {
    key,
    label,
    ownerRole,
    blockingForV1: true,
    items: items.map(([itemKey, itemLabel]) => ({
      key: itemKey,
      label: itemLabel,
      required: true,
      status: "pending",
      evidenceRef: "",
      notes: "",
    })),
  };
}

function validateManifestShape(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be a JSON object"];
  }
  if (manifest.schema !== manifestSchema) errors.push(`schema must be ${manifestSchema}`);
  if (!manifest.environment || typeof manifest.environment !== "object") errors.push("environment is required");
  if (!Array.isArray(manifest.evidenceGroups)) errors.push("evidenceGroups must be an array");
  if (!Array.isArray(manifest.signoffs)) errors.push("signoffs must be an array");
  if (!manifest.v1V2BoundaryConfirmed || typeof manifest.v1V2BoundaryConfirmed !== "object") {
    errors.push("v1V2BoundaryConfirmed is required");
  }
  if (Array.isArray(manifest.evidenceGroups)) {
    const groupKeys = new Set(manifest.evidenceGroups.map((group) => group?.key));
    for (const key of requiredEvidenceGroupKeys) {
      if (!groupKeys.has(key)) errors.push(`missing evidence group: ${key}`);
    }
    for (const group of manifest.evidenceGroups) {
      if (!group || typeof group !== "object") {
        errors.push("evidence group must be an object");
        continue;
      }
      if (!group.key) errors.push("evidence group key is required");
      if (!group.label) errors.push(`evidence group ${group.key || "<unknown>"} label is required`);
      if (!Array.isArray(group.items) || group.items.length === 0) {
        errors.push(`evidence group ${group.key || "<unknown>"} must have items`);
        continue;
      }
      for (const item of group.items) {
        if (!item || typeof item !== "object") {
          errors.push(`evidence group ${group.key || "<unknown>"} has a non-object item`);
          continue;
        }
        if (!item.key) errors.push(`evidence group ${group.key || "<unknown>"} has item without key`);
        if (!item.label) errors.push(`evidence item ${item.key || "<unknown>"} label is required`);
        if (typeof item.required !== "boolean") errors.push(`evidence item ${item.key || "<unknown>"} required must be boolean`);
        if (!knownItemStatuses.has(item.status)) errors.push(`evidence item ${item.key || "<unknown>"} has invalid status ${item.status}`);
      }
    }
  }
  if (Array.isArray(manifest.signoffs)) {
    const signoffRoles = new Set(manifest.signoffs.map((signoff) => signoff?.role));
    for (const role of requiredSignoffRoles) {
      if (!signoffRoles.has(role)) errors.push(`missing signoff role: ${role}`);
    }
    for (const signoff of manifest.signoffs) {
      if (!signoff || typeof signoff !== "object") {
        errors.push("signoff must be an object");
        continue;
      }
      if (!signoff.role) errors.push("signoff role is required");
      if (typeof signoff.required !== "boolean") errors.push(`signoff ${signoff.role || "<unknown>"} required must be boolean`);
      if (!knownSignoffStatuses.has(signoff.status)) errors.push(`signoff ${signoff.role || "<unknown>"} has invalid status ${signoff.status}`);
    }
  }
  if (manifest.v1V2BoundaryConfirmed && typeof manifest.v1V2BoundaryConfirmed === "object") {
    const boundary = manifest.v1V2BoundaryConfirmed;
    if (!Array.isArray(boundary.v1) || boundary.v1.length === 0) errors.push("v1V2BoundaryConfirmed.v1 must list V1 scope");
    if (!Array.isArray(boundary.v2) || boundary.v2.length === 0) errors.push("v1V2BoundaryConfirmed.v2 must list V2 scope");
    if (!knownBoundaryStatuses.has(boundary.status)) errors.push(`v1V2BoundaryConfirmed has invalid status ${boundary.status}`);
  }
  return errors;
}

function validateGroup(group) {
  const itemResults = group.items.map((item) => validateItem(group, item));
  const blockers = itemResults.filter((item) => item.blocking).map((item) => ({
    type: "evidence_item",
    groupKey: group.key,
    groupLabel: group.label,
    key: item.key,
    label: item.label,
    status: item.status,
    reason: item.reason,
  }));
  const requiredTotal = itemResults.filter((item) => item.required).length;
  const completedRequired = itemResults.filter((item) => item.required && !item.blocking).length;
  return {
    key: group.key,
    label: group.label,
    ownerRole: group.ownerRole || "",
    blockingForV1: group.blockingForV1 !== false,
    status: blockers.length === 0 ? "ready" : "blocked",
    ready: blockers.length === 0,
    requiredTotal,
    completedRequired,
    blockedRequired: blockers.length,
    items: itemResults.map(({ blocking: _blocking, reason: _reason, ...item }) => item),
    blockers,
  };
}

function validateItem(group, item) {
  const status = item.status || "pending";
  const evidenceRefFilled = Boolean(String(item.evidenceRef || "").trim());
  let blocking = false;
  let reason = "";
  if (item.required && group.blockingForV1 !== false) {
    if (!completionItemStatuses.has(status)) {
      blocking = true;
      reason = "required evidence item is not passed or accepted";
    } else if (!evidenceRefFilled) {
      blocking = true;
      reason = "required evidence item has no evidenceRef";
    }
  }
  return {
    key: item.key,
    label: item.label,
    required: item.required,
    status,
    evidenceRefFilled,
    notesFilled: Boolean(String(item.notes || "").trim()),
    blocking,
    reason,
  };
}

function validateSignoff(signoff) {
  const status = signoff.status || "pending";
  const signerFilled = Boolean(String(signoff.signer || "").trim());
  const signedAtFilled = Boolean(String(signoff.signedAt || "").trim());
  const blocking = Boolean(signoff.required) && (!completionSignoffStatuses.has(status) || !signerFilled || !signedAtFilled);
  return {
    role: signoff.role,
    required: Boolean(signoff.required),
    status,
    signerFilled,
    signedAtFilled,
    notesFilled: Boolean(String(signoff.notes || "").trim()),
    blocking,
    reason: blocking ? "required signoff is not signed/accepted with signer and signedAt" : "",
  };
}

function validateBoundary(boundary) {
  const status = boundary.status || "pending";
  const confirmedByFilled = Boolean(String(boundary.confirmedBy || "").trim());
  const confirmedAtFilled = Boolean(String(boundary.confirmedAt || "").trim());
  const blocking = status !== "confirmed" || !confirmedByFilled || !confirmedAtFilled;
  return {
    status,
    confirmedByFilled,
    confirmedAtFilled,
    v1ItemCount: Array.isArray(boundary.v1) ? boundary.v1.length : 0,
    v2ItemCount: Array.isArray(boundary.v2) ? boundary.v2.length : 0,
    blocking,
    reason: blocking ? "V1 / V2 boundary is not confirmed with confirmedBy and confirmedAt" : "",
  };
}

function countSensitiveEvidenceRefs(manifest) {
  const evidenceRefs = manifest.evidenceGroups.flatMap((group) =>
    group.items.map((item) => String(item.evidenceRef || "")),
  );
  return evidenceRefs.filter(hasSensitiveMarker).length;
}

function hasSensitiveMarker(value) {
  return /postgres:\/\/|mysql:\/\/|mongodb:\/\/|AKIA[0-9A-Z]{8,}|secret|password|passwd|access[_-]?key|\/var\/spool|\/usr\/bin\/lp/i.test(
    value,
  );
}

function emptySummary() {
  return {
    label: "V1 现场证据清单格式错误",
    evidenceGroupsTotal: 0,
    evidenceGroupsReady: 0,
    requiredEvidenceItemsTotal: 0,
    requiredEvidenceItemsCompleted: 0,
    requiredSignoffsTotal: 0,
    requiredSignoffsCompleted: 0,
    blockingCount: 0,
  };
}
