#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const defaultOutputDir = ".erp-local-storage/v1-production-deployment-manifest";

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const gitState = inspectGitState(options.rootDir);
    const report = buildProductionDeploymentManifestReport({
      rootDir: options.rootDir,
      nodeVersion: process.versions.node,
      gitState,
      requireRemote: options.requireRemote,
      requireClean: options.requireClean,
    });
    const output = options.write
      ? { ...report, artifacts: writeArtifacts(report, options.outputDir) }
      : report;
    process.stdout.write(options.json ? `${JSON.stringify(output, null, 2)}\n` : formatReport(output));
    process.exitCode = report.ready ? 0 : 2;
  } catch {
    process.stderr.write("V1 production deployment manifest check failed without exposing repository or host paths.\n");
    process.exitCode = 1;
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    outputDir: defaultOutputDir,
    requireRemote: true,
    requireClean: true,
    write: true,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root-dir") {
      options.rootDir = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--allow-missing-remote") {
      options.requireRemote = false;
      continue;
    }
    if (arg === "--allow-dirty-worktree") {
      options.requireClean = false;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-deployment-manifest.mjs [options]",
    "",
    "Options:",
    "  --root-dir <path>             Repository checkout to inspect.",
    "  --output-dir <path>           Redacted report directory.",
    "  --allow-missing-remote        Do not block an offline package solely for missing Git remote.",
    "  --allow-dirty-worktree        Do not block an inspection solely for local changes.",
    "  --no-write                    Do not write report artifacts.",
    "  --json                        Print JSON.",
    "",
    "The report contains only booleans, counts, labels, and an abbreviated commit id.",
  ].join("\n");
}

export function buildProductionDeploymentManifestReport(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const read = (relativePath) => readText(rootDir, relativePath);
  const packageJson = readJson(rootDir, "package.json");
  const gitState = options.gitState ?? { repository: false, remoteCount: 0, clean: false, commit: "" };
  const requireRemote = options.requireRemote !== false;
  const requireClean = options.requireClean !== false;
  const nodeMajor = Number(String(options.nodeVersion ?? process.versions.node).split(".")[0]);
  const service = read("deploy/production/systemd/erp-api.service");
  const healthService = read("deploy/production/systemd/erp-api-healthcheck.service");
  const healthTimer = read("deploy/production/systemd/erp-api-healthcheck.timer");
  const bagwinService = read("deploy/production/systemd/erp-bagwin-integration.service");
  const priceWorkerService = read("deploy/production/systemd/erp-price-release-worker.service");
  const artworkWorkerService = read("deploy/production/systemd/erp-miniapp-artwork-worker.service");
  const integrationHealthService = read("deploy/production/systemd/erp-miniapp-integration-healthcheck.service");
  const integrationHealthTimer = read("deploy/production/systemd/erp-miniapp-integration-healthcheck.timer");
  const deliAttendanceService = read("deploy/production/deli-attendance-gateway.service.example");
  const deliAttendanceEnv = read("deploy/production/deli-attendance-gateway.env.example");
  const nginx = read("deploy/production/nginx/erp.conf");
  const miniappAllowlist = read("deploy/production/nginx/miniapp-integration-allowlist.conf.example");
  const serviceEnv = read("deploy/production/erp-service.env.example");
  const productionEnvTemplate = read("docs/development/v1-production.env.example");
  const frontendEnv = read("deploy/production/frontend-build.env.example");
  const graceful = read("server/gracefulShutdown.mjs");
  const apiServer = read("server/apiServer.mjs");
  const checks = [
    check("node", "Node 24 运行基线", nodeMajor === 24 && packageJson.engines?.node === ">=24 <25"),
    check("lockfile", "锁文件可重复安装", existsSync(join(rootDir, "package-lock.json"))),
    check("nvmrc", "Node 版本文件", read(".nvmrc").trim() === "24"),
    check("build", "前端构建产物", existsSync(join(rootDir, "dist", "index.html"))),
    check(
      "service",
      "systemd API 服务",
      includesAll(service, [
        "User=erp",
        "WorkingDirectory=/opt/erp/current",
        "Environment=ERP_RUNTIME_MODE=production",
        "EnvironmentFile=/etc/erp/erp-service.env",
        "ExecStart=/usr/bin/node server/apiServer.mjs --mode production",
        "KillSignal=SIGTERM",
        "TimeoutStopSec=30s",
        "NoNewPrivileges=true",
        "ProtectSystem=strict",
        "ReadWritePaths=/var/lib/erp /var/spool/erp-print",
      ]),
    ),
    check(
      "service-env",
      "systemd 非密钥接线",
      includesAll(serviceEnv, [
        "ERP_V1_PRODUCTION_ENV_FILE=/etc/erp/erp.production.env",
        "ERP_V1_GO_LIVE_ARTIFACT_ROOT=/var/lib/erp/v1-go-live-artifacts",
        "ERP_API_PORT=8787",
        "ERP_API_SHUTDOWN_TIMEOUT_MS=25000",
        "ERP_FIRST_RELEASE_SCOPE=raw_material",
        "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=/var/spool/erp-print",
      ]) && !/(DATABASE_URL|SECRET_ACCESS_KEY|AUTH_SECRET)=\S+/i.test(serviceEnv),
    ),
    check(
      "graceful-shutdown",
      "API 优雅停机",
      includesAll(graceful, ["SIGTERM", "SIGINT", "closeResources", "closeAllConnections"]) &&
        includesAll(apiServer, ["createGracefulShutdownController", "closeSharedPostgresPools"]),
    ),
    check(
      "health-timer",
      "systemd 周期健康检查",
      includesAll(healthService, ["run-v1-production-service-health-check.mjs", "ProtectSystem=strict"]) &&
        includesAll(healthTimer, ["OnUnitActiveSec=1min", "Persistent=true"]),
    ),
    check(
      "miniapp-integration-services",
      "小程序接单、价格和稿件独立进程",
      includesAll(bagwinService, [
        "User=erp",
        "EnvironmentFile=/etc/erp/erp-service.env",
        "ExecStart=/usr/bin/node server/miniapp/startBagwinErpIntegrationServer.mjs",
        "NoNewPrivileges=true",
        "ProtectSystem=strict",
      ]) && includesAll(priceWorkerService, [
        "User=erp",
        "ExecStart=/usr/bin/node server/miniapp/startErpPriceReleaseDeliveryWorker.mjs",
        "TimeoutStopSec=6min",
        "NoNewPrivileges=true",
      ]) && includesAll(artworkWorkerService, [
        "User=erp",
        "ExecStart=/usr/bin/node server/miniapp/startMiniappArtworkTransferWorker.mjs",
        "TimeoutStopSec=15min",
        "NoNewPrivileges=true",
      ]),
    ),
    check(
      "miniapp-integration-health",
      "小程序接入与异步队列周期健康检查",
      includesAll(integrationHealthService, [
        "run-miniapp-integration-health-check.mjs",
        "erp-bagwin-integration.service",
        "erp-price-release-worker.service",
        "erp-miniapp-artwork-worker.service",
        "ProtectSystem=strict",
      ]) && includesAll(integrationHealthTimer, [
        "OnUnitActiveSec=1min",
        "Persistent=true",
      ]),
    ),
    check(
      "deli-attendance-gateway",
      "得力D5FN考勤独立网关",
      includesAll(deliAttendanceService, [
        "User=erp",
        "EnvironmentFile=/etc/erp/deli-attendance-gateway.env",
        "ExecStartPre=/usr/bin/npm run deli-attendance-gateway:production-preflight -- --env-file /etc/erp/deli-attendance-gateway.env",
        "ExecStart=/usr/bin/npm run deli-attendance-gateway:production",
        "UMask=0077",
        "NoNewPrivileges=true",
        "ProtectSystem=strict",
      ]) && includesAll(deliAttendanceEnv, [
        "DELI_EPLUS_APP_KEY=<REPLACE_WITH_DELI_APP_KEY>",
        "DELI_EPLUS_APP_SECRET=<REPLACE_WITH_DELI_APP_SECRET>",
        "DELI_EPLUS_API_BASE_URL=https://v2-api.delicloud.com",
        "DELI_ATTENDANCE_GATEWAY_DATABASE_URL=<RESTRICTED_POSTGRES_CONNECTION_URL>",
        "DELI_ATTENDANCE_GATEWAY_TOKEN=<REPLACE_WITH_DISTINCT_HIGH_ENTROPY_GATEWAY_TOKEN>",
        "DELI_ATTENDANCE_GATEWAY_HOST=127.0.0.1",
        "DELI_ATTENDANCE_GATEWAY_PATH=/v1/punches/query",
      ]) &&
        existsSync(join(rootDir, "server", "startDeliAttendanceGatewayServer.mjs")) &&
        existsSync(join(rootDir, "scripts", "run-deli-attendance-gateway-production-preflight.mjs")),
    ),
    check(
      "nginx",
      "nginx TLS、静态资源和 API 代理",
      includesAll(nginx, [
        "listen 443 ssl",
        "ssl_certificate",
        "root /opt/erp/current/dist",
        "proxy_pass http://127.0.0.1:8787/api/health",
        "location /api/",
        "client_max_body_size 75m",
        "location = /api/raw-material-inbounds/recognize-delivery-note",
        "proxy_read_timeout 180s",
        "location = /api/attachments/binary",
        "client_max_body_size 210m",
        "try_files $uri $uri/ /index.html",
        'Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always',
        'Pragma "no-cache" always',
        'Expires "0" always',
        "Strict-Transport-Security",
      ]),
    ),
    check(
      "miniapp-integration-nginx",
      "小程序接单公网入口隔离",
      includesAll(nginx, [
        "limit_req_zone $binary_remote_addr zone=miniapp_integration_per_ip:10m rate=60r/m",
        "location ^~ /api/v1/integrations/bagwin/orders",
        "include /etc/erp/nginx/miniapp-integration-allowlist.conf",
        "limit_req zone=miniapp_integration_per_ip burst=12 nodelay",
        "proxy_pass http://127.0.0.1:8790",
      ]) && includesAll(miniappAllowlist, ["allow 192.0.2.10/32", "deny all"]),
    ),
    check(
      "miniapp-integration-env-template",
      "小程序接入密钥和端点安全模板",
      includesAll(productionEnvTemplate, [
        "BAGWIN_ERP_HMAC_SHARED_SECRET=<REPLACE_WITH_HIGH_ENTROPY_BAGWIN_SHARED_SECRET>",
        "MINIAPP_PRICE_RELEASE_BASE_URL=https://api.luxingpack.com/",
        "MINIAPP_PRICE_RELEASE_HMAC_SHARED_SECRET=<REPLACE_WITH_DISTINCT_HIGH_ENTROPY_PRICE_RELEASE_SECRET>",
        "MINIAPP_ARTWORK_BASE_URL=https://api.luxingpack.com/",
        "MINIAPP_ARTWORK_HMAC_SHARED_SECRET=<REPLACE_WITH_DISTINCT_HIGH_ENTROPY_ARTWORK_TRANSFER_SECRET>",
      ]),
    ),
    check(
      "frontend-env",
      "生产前端同源 API 与原材料首发范围",
      includesAll(frontendEnv, [
        "VITE_ERP_RUNTIME_MODE=production",
        "VITE_ERP_API_BASE_URL=/api",
        "VITE_RAW_MATERIAL_FIRST_RELEASE=true",
        "VITE_ERP_RELEASE_TARGET=tencent-production",
        "VITE_ERP_RELEASE_COMMIT=<REPLACE_WITH_FULL_40_CHARACTER_RELEASE_COMMIT>",
        "VITE_ERP_RELEASE_LOCK_DIGEST=<REPLACE_WITH_64_CHARACTER_RELEASE_LOCK_DIGEST>",
      ]),
    ),
    check(
      "controlled-release",
      "统一受控发布锁与版本身份",
      existsSync(join(rootDir, "scripts", "run-controlled-release-lock.mjs")) &&
        existsSync(join(rootDir, "scripts", "verify-controlled-release-lock.mjs")) &&
        existsSync(join(rootDir, "scripts", "run-controlled-release-build.mjs")) &&
        existsSync(join(rootDir, "scripts", "run-controlled-release-postdeploy-check.mjs")) &&
        includesAll(serviceEnv, [
          "ERP_RELEASE_TARGET=tencent-production",
          "ERP_RELEASE_COMMIT=<REPLACE_WITH_FULL_40_CHARACTER_RELEASE_COMMIT>",
          "ERP_RELEASE_LOCK_DIGEST=<REPLACE_WITH_64_CHARACTER_RELEASE_LOCK_DIGEST>",
        ]) && includesAll(apiServer, ["releaseIdentityFromEnvironment", "workspace.releaseIdentity"]),
    ),
    check(
      "recovery-runner",
      "全新目录恢复检查器",
      existsSync(join(rootDir, "scripts", "run-v1-production-remote-recovery.mjs")),
    ),
    check(
      "runbook",
      "部署与恢复手册",
      existsSync(join(rootDir, "docs", "development", "v1-production-deployment-recovery.zh-CN.md")),
    ),
    check("git-repository", "Git 提交可追溯", gitState.repository === true && Boolean(gitState.commit)),
    check(
      "git-remote",
      "受控 Git 远端",
      !requireRemote || Number(gitState.remoteCount ?? 0) > 0,
      requireRemote ? "blocking" : "warning",
    ),
    check("git-clean", "候选工作区无未提交修改", !requireClean || gitState.clean === true, requireClean ? "blocking" : "warning"),
  ];
  const blockingChecks = checks.filter((item) => item.severity === "blocking");
  const warningChecks = checks.filter((item) => item.severity === "warning" && !item.ready);
  const passedCount = checks.filter((item) => item.ready).length;
  const ready = blockingChecks.every((item) => item.ready);

  return {
    scope: "v1_production_deployment_manifest",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: new Date().toISOString(),
    release: {
      commit: abbreviateCommit(gitState.commit),
      remoteConfigured: Number(gitState.remoteCount ?? 0) > 0,
      worktreeClean: gitState.clean === true,
    },
    summary: {
      passedCount,
      totalCount: checks.length,
      blockingCount: blockingChecks.filter((item) => !item.ready).length,
      warningCount: warningChecks.length,
    },
    checks,
    nextAction: ready
      ? "在另一台受控主机运行远端恢复检查，保留 clone、安装、构建、迁移计划和运行态 smoke 报告。"
      : "先补齐报告中的部署清单、受控 Git 远端或干净候选提交，再执行全新目录恢复检查。",
    safeguards: {
      readOnly: true,
      repositoryUrlExposed: false,
      rootPathExposed: false,
      envPathExposed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      commandOutputIncluded: false,
    },
  };
}

function inspectGitState(rootDir) {
  const repository = runGit(rootDir, ["rev-parse", "--is-inside-work-tree"]).stdout.trim() === "true";
  if (!repository) return { repository: false, remoteCount: 0, clean: false, commit: "" };
  const commit = runGit(rootDir, ["rev-parse", "HEAD"]).stdout.trim();
  const remotes = runGit(rootDir, ["remote"]).stdout.split("\n").filter(Boolean);
  const clean = runGit(rootDir, ["status", "--porcelain"]).stdout.trim() === "";
  return { repository, remoteCount: remotes.length, clean, commit };
}

function runGit(rootDir, args) {
  const result = spawnSync("git", ["-C", rootDir, ...args], { encoding: "utf8", timeout: 5_000 });
  return { status: result.status, stdout: result.status === 0 ? String(result.stdout ?? "") : "" };
}

function readText(rootDir, relativePath) {
  const path = join(rootDir, relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readJson(rootDir, relativePath) {
  try {
    return JSON.parse(readText(rootDir, relativePath));
  } catch {
    return {};
  }
}

function includesAll(value, fragments) {
  return fragments.every((fragment) => value.includes(fragment));
}

function check(key, label, ready, severity = "blocking") {
  return { key, label, severity, ready: ready === true, status: ready === true ? "passed" : "blocked" };
}

function abbreviateCommit(value) {
  const commit = String(value ?? "").trim();
  return /^[a-f0-9]{7,64}$/i.test(commit) ? commit.slice(0, 12) : "unavailable";
}

function writeArtifacts(report, outputDir) {
  const target = resolve(outputDir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(target, "latest.md"), formatReport(report), "utf8");
  return { jsonWritten: true, markdownWritten: true, outputPathExposed: false };
}

export function formatReport(report) {
  return [
    "# V1 生产部署清单检查",
    "",
    `- 状态：${report.status}`,
    `- 通过：${report.summary.passedCount}/${report.summary.totalCount}`,
    `- 阻塞：${report.summary.blockingCount}`,
    `- 警告：${report.summary.warningCount}`,
    `- 候选提交：${report.release.commit}`,
    `- 受控远端：${report.release.remoteConfigured ? "已配置" : "未配置"}`,
    `- 工作区：${report.release.worktreeClean ? "干净" : "有未提交修改"}`,
    "",
    "## 检查项",
    "",
    ...report.checks.map((item) => `- ${item.label}：${item.status}`),
    "",
    `下一步：${report.nextAction}`,
    "",
  ].join("\n");
}
