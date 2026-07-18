function stringValue(value) {
  return value == null ? "" : String(value);
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, String.raw`\|`).replace(/\n/g, " ");
}

function csvCell(value) {
  return `"${stringValue(value).replace(/"/g, '""')}"`;
}

function defaultProductionEnvFixGuidance(key) {
  const guidance = {
    "v1-persistence-profile": {
      valueGuidance: [
        "生产必须显式使用 postgres 仓储 profile；真实连接串只放安全 env 文件。",
        "文件留档 profile 必须切到 object_storage，并与附件对象存储配置同时复核。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "npm run v1-production-profile-live:check",
      ],
    },
    "postgres-restore-validation-env": {
      valueGuidance: [
        "生产恢复演练必须使用专用可重置验证库，不能和生产源库指向同一 host/port/database。",
        "`ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED` 在生产 env 中必须保持 false；实际恢复演练时由负责人显式传 `--allow-restore-reset`。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "node -- scripts/run-v1-production-postgres-backup-restore-check.mjs --use-production-env-setup-env-file --allow-restore-reset",
      ],
    },
    "attachment-object-storage-env": {
      valueGuidance: [
        "endpoint、bucket、access key、secret key 必须来自真实 OSS/S3/COS 或兼容对象存储。",
        "bucket 需要支持附件上传、读回、下载和签名 URL 留档；不要使用本地目录替代。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "node -- scripts/run-v1-production-object-storage-preflight.mjs --use-production-env-setup-env-file",
        "在上线状态页执行附件留档预检，并保留上传 / 读回现场证据。",
      ],
    },
    "statement-export-object-storage-env": {
      valueGuidance: [
        "对账导出可以使用独立 bucket，也可以在附件对象存储完整时复用附件 fallback。",
        "如使用独立 bucket，4 个 ERP_STATEMENT_EXPORT_OBJECT_STORAGE_* 变量必须成套配置。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "node -- scripts/run-v1-production-object-storage-preflight.mjs --use-production-env-setup-env-file",
        "在真实 API 上导出一份客户对账单并确认导出记录可重新下载。",
      ],
    },
    "system-printer-command-bridge-env": {
      valueGuidance: [
        "打印桥必须启用 command_bridge，并指向生产打印桥命令或 Node 命令。",
        "命令参数必须是 JSON array，allowlist 只能列真实允许打印的设备名。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "在上线状态页依次执行 spool 预检和打印门禁预检。",
      ],
    },
    "cups-preflight-env": {
      valueGuidance: [
        "CUPS 模式必须使用 cups_lp，allowlist 只列现场真实 CUPS 队列。",
        "状态命令必须是非出纸命令，例如 lpstat；参数必须是 JSON array。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "在上线状态页执行 CUPS 预检，并保留现场 lpstat / 队列截图证据。",
      ],
    },
    "v1-readiness-identity-env": {
      valueGuidance: [
        "API base URL 必须指向生产 API，不要使用本机 localhost 作为生产验收目标。",
        "办公室和司机验收账号必须是真实生产账号，权限应与现场岗位一致。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "npm run v1-readiness:check",
        "用指定账号在上线状态页执行运行时门禁、司机真机和打印门禁预检。",
      ],
    },
    "v1-field-acceptance-report-env": {
      valueGuidance: [
        "输出目录必须是上线交接包可归档的位置，不能依赖临时目录。",
        "现场验收 API 地址应与 readiness 目标一致，避免报告和实际运行实例不一致。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "生成 V1 现场验收 JSON / Markdown 报告。",
        "把报告编号回填到现场证据采集包后再刷新 go-live suite。",
      ],
    },
    "local-v1-acceptance-bypass-env": {
      valueGuidance: [
        "生产默认不接受本地持久化或本地文件留档。",
        "如业务负责人临时接受，必须填写书面签字编号，且 release candidate 仍需显示 warning。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "确认负责人签字 / V1-V2 边界表已记录该风险是否被接受。",
      ],
    },
    "preflight-redaction-safeguard": {
      valueGuidance: [
        "报告只能输出变量名、计数、状态和脱敏下一步。",
        "不要把真实连接串、secret、命令路径、spool 路径或 token 粘贴进交接文档。",
      ],
      verificationSteps: ["npm run v1-production-env-preflight:check", "git diff --check"],
    },
  }[stringValue(key)];
  return {
    valueGuidance: stringList(guidance?.valueGuidance),
    verificationSteps: stringList(guidance?.verificationSteps),
  };
}

export function buildProductionEnvFixChecklist(envPreflight) {
  const items = Array.isArray(envPreflight?.fixChecklist)
    ? envPreflight.fixChecklist.map((item) => {
        const defaults = defaultProductionEnvFixGuidance(item.key);
        const valueGuidance = stringList(item.valueGuidance);
        const verificationSteps = stringList(item.verificationSteps);
        return {
          key: stringValue(item.key || "unknown"),
          label: stringValue(item.label || item.key || "生产环境预检项"),
          status: stringValue(item.status || "pending"),
          ready: item.ready === true,
          blocking: item.blocking !== false,
          severity: stringValue(item.severity || (item.ready ? "ok" : item.blocking === false ? "warning" : "blocking")),
          ownerRole: stringValue(item.ownerRole || "技术/管理"),
          requiredVariables: stringList(item.requiredVariables),
          recommendedVariables: stringList(item.recommendedVariables),
          configuredVariableCount: numberOrZero(item.configuredVariableCount),
          totalVariableCount: numberOrZero(item.totalVariableCount),
          missingVariables: stringList(item.missingVariables),
          placeholderVariableCount: numberOrZero(item.placeholderVariableCount),
          placeholderVariables: stringList(item.placeholderVariables),
          valueGuidance: valueGuidance.length ? valueGuidance : defaults.valueGuidance,
          verificationSteps: verificationSteps.length ? verificationSteps : defaults.verificationSteps,
          nextAction: stringValue(item.nextAction),
        };
      })
    : [];
  return {
    included: items.length > 0,
    status: stringValue(envPreflight?.status || ""),
    ready: envPreflight?.ready === true,
    checkedAt: stringValue(envPreflight?.checkedAt || ""),
    envFileCount: numberOrZero(envPreflight?.envFileCount),
    summary: envPreflight?.summary || {},
    fixItemCount: items.length,
    blockingItemCount: items.filter((item) => item.severity === "blocking").length,
    warningItemCount: items.filter((item) => item.severity === "warning").length,
    placeholderVariableCount: items.reduce((total, item) => total + item.placeholderVariableCount, 0),
    items,
  };
}

export function formatProductionEnvFixChecklistMarkdown(report) {
  const checklist = report.productionEnvFixChecklist;
  const lines = [
    "# ERP V1 生产环境修正清单",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 来源 release-candidate：${report.releaseCandidate.generatedAt || "未返回"}`,
    `- 状态：${checklist.ready ? "READY" : "BLOCKED"}`,
    `- 汇总：${checklist.summary?.label || "未返回"}`,
    `- 修正项：${checklist.fixItemCount} 项；阻塞 ${checklist.blockingItemCount} 项；提醒 ${checklist.warningItemCount} 项`,
    `- 未替换占位变量：${checklist.placeholderVariableCount} 个`,
    "",
    "## 修正项",
    "",
    "| 负责人 | 项目 | 级别 | 状态 | 配置数 | 必填变量 | 需补变量 | 占位变量 | 填写提示 | 复核步骤 | 下一步 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...checklist.items.map(
      (item) =>
        `| ${escapeMarkdownTable(item.ownerRole)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.severity)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(`${item.configuredVariableCount}/${item.totalVariableCount}`)} | ${escapeMarkdownTable(item.requiredVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.missingVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.placeholderVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.valueGuidance.join("; ") || "无")} | ${escapeMarkdownTable(item.verificationSteps.join("; ") || "无")} | ${escapeMarkdownTable(item.nextAction)} |`,
    ),
    "",
    "## 使用规则",
    "",
    "- 只把真实连接串、对象存储密钥、命令路径、spool 路径和 token 写入安全的未跟踪 env 文件。",
    "- 修正后重新运行生产环境变量预检、release-candidate 和 go-live suite。",
    "- 该清单只帮助分派生产环境配置工作；它不能替代真实服务联通、现场证据、负责人签字或 V1/V2 边界确认。",
    "",
  ];
  return `${lines.join("\n")}`;
}

export function formatProductionEnvFixChecklistCsv(items) {
  const header = [
    "key",
    "label",
    "ownerRole",
    "severity",
    "status",
    "configuredVariableCount",
    "totalVariableCount",
    "requiredVariables",
    "missingVariables",
    "placeholderVariables",
    "valueGuidance",
    "verificationSteps",
    "nextAction",
  ];
  const rows = items.map((item) => [
    item.key,
    item.label,
    item.ownerRole,
    item.severity,
    item.status,
    item.configuredVariableCount,
    item.totalVariableCount,
    item.requiredVariables.join("; "),
    item.missingVariables.join("; "),
    item.placeholderVariables.join("; "),
    item.valueGuidance.join("; "),
    item.verificationSteps.join("; "),
    item.nextAction,
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
