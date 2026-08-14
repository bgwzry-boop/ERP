#!/usr/bin/env node

import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  buildProductionDeploymentManifestReport,
  formatReport,
} from "./run-v1-production-deployment-manifest.mjs";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const gitState = {
  repository: true,
  remoteCount: 1,
  clean: true,
  commit: "1234567890abcdef1234567890abcdef12345678",
};
const ready = buildProductionDeploymentManifestReport({
  rootDir,
  nodeVersion: "24.14.0",
  gitState,
  requireRemote: true,
  requireClean: true,
});
assert.equal(ready.ready, true, ready.checks.filter((item) => !item.ready).map((item) => item.key).join(", "));
assert.equal(ready.summary.blockingCount, 0);
assert.equal(ready.release.commit, "1234567890ab");
assert.equal(ready.checks.find((item) => item.key === "service-env")?.ready, true);
assert.equal(ready.checks.find((item) => item.key === "frontend-env")?.ready, true);
assert.equal(ready.checks.find((item) => item.key === "miniapp-integration-services")?.ready, true);
assert.equal(ready.checks.find((item) => item.key === "miniapp-integration-health")?.ready, true);
assert.equal(ready.checks.find((item) => item.key === "miniapp-integration-nginx")?.ready, true);
assert.equal(ready.checks.find((item) => item.key === "miniapp-integration-env-template")?.ready, true);
assert.equal(ready.checks.find((item) => item.key === "deli-attendance-gateway")?.ready, true);
assert.match(formatReport(ready), /受控远端：已配置/);
assert.doesNotMatch(JSON.stringify(ready), new RegExp(rootDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const blocked = buildProductionDeploymentManifestReport({
  rootDir,
  nodeVersion: "22.0.0",
  gitState: { ...gitState, remoteCount: 0, clean: false },
  requireRemote: true,
  requireClean: true,
});
assert.equal(blocked.ready, false);
assert.ok(blocked.summary.blockingCount >= 3);
assert.equal(blocked.checks.find((item) => item.key === "node")?.ready, false);
assert.equal(blocked.checks.find((item) => item.key === "git-remote")?.ready, false);
assert.equal(blocked.checks.find((item) => item.key === "git-clean")?.ready, false);

const offline = buildProductionDeploymentManifestReport({
  rootDir,
  nodeVersion: "24.14.0",
  gitState: { ...gitState, remoteCount: 0 },
  requireRemote: false,
});
assert.equal(offline.ready, true);

console.log("V1 production deployment manifest check passed.");
