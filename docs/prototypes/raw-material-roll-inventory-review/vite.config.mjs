import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const COMPLETE_REVIEW_APP_ID = "bagwin-complete-review-4174";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function readGitValue(args, fallback = "") {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function createLocalReviewProvenance() {
  const baseCommit = readGitValue(["rev-parse", "HEAD"], "unknown").toLowerCase();
  const worktreeStatus = readGitValue(["status", "--porcelain=v1", "--untracked-files=all"]);
  const dirty = Boolean(worktreeStatus);
  let revision = 0;
  const state = () => createHash("sha256")
    .update(`${baseCommit}\0${worktreeStatus}\0${process.pid}\0${revision}`)
    .digest("hex");
  return {
    baseCommit,
    dirty,
    state,
    advance() {
      revision += 1;
    },
  };
}

export function enforceCompleteReviewPortPlugin() {
  return {
    name: "erp-enforce-complete-review-port",
    configResolved(config) {
      if (config.command !== "serve" || Number(config.server?.port) === 4174) return;
      const error = new Error(
        "The complete ERP review app has one local identity and must run on port 4174.",
      );
      error.code = "ERP_COMPLETE_REVIEW_PORT_REQUIRED";
      throw error;
    },
  };
}

export function disableCompleteReviewBootstrapCachingPlugin(options = {}) {
  const provenance = options.provenance ?? createLocalReviewProvenance();
  const bootstrapPaths = new Set([
    "/",
    "/index.html",
    "/src/main.jsx",
    "/src/complete-review-entry.jsx",
  ]);
  return {
    name: "erp-disable-complete-review-bootstrap-caching",
    transformIndexHtml() {
      return [
        { tag: "meta", attrs: { name: "erp-preview-kind", content: "local-unreleased" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "erp-preview-base-commit", content: provenance.baseCommit }, injectTo: "head" },
        { tag: "meta", attrs: { name: "erp-preview-state", content: provenance.state() }, injectTo: "head" },
        { tag: "meta", attrs: { name: "erp-preview-dirty", content: provenance.dirty ? "true" : "false" }, injectTo: "head" },
      ];
    },
    configureServer(server) {
      let refreshTimer = null;
      server.watcher.on("all", (_event, changedPath) => {
        if (String(changedPath).includes("/node_modules/")) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => provenance.advance(), 40);
      });
      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
        if (bootstrapPaths.has(requestUrl.pathname)) {
          const forceIdentityHeaders = () => {
            response.setHeader("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
            response.setHeader("pragma", "no-cache");
            response.setHeader("expires", "0");
            response.setHeader("x-erp-app-id", COMPLETE_REVIEW_APP_ID);
            response.setHeader("x-erp-preview-kind", "local-unreleased");
            response.setHeader("x-erp-preview-base-commit", provenance.baseCommit);
            response.setHeader("x-erp-preview-state", provenance.state());
            response.setHeader("x-erp-preview-dirty", provenance.dirty ? "true" : "false");
          };
          const writeHead = response.writeHead.bind(response);
          response.writeHead = (...args) => {
            forceIdentityHeaders();
            return writeHead(...args);
          };
          forceIdentityHeaders();
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            if (id.includes("/src/features/v1-status/")) return "erp-v1-status";
            if (id.includes("/src/pages/")) return "erp-pages";
            if (id.includes("/src/shared/") || id.includes("/shared/")) return "erp-shared";
            if (id.includes("/src/services/officeV1GoLiveStatus")) return "erp-v1-runtime";
            if (id.includes("/src/services/") || id.includes("/src/state/")) return "erp-runtime";
            if (id.includes("/src/domain/")) return "erp-domain";
            if (id.includes("/src/data/")) return "erp-data";
            return undefined;
          }
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react-vendor";
          if (id.includes("@ant-design/icons") || id.includes("@ant-design/icons-svg")) return "antd-icons";
          return "vendor";
        },
      },
    },
  },
  define: command === "build"
    ? { "import.meta.env.VITE_ERP_API_BASE_URL": JSON.stringify(process.env.VITE_ERP_API_BASE_URL || "/api") }
    : {},
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/complete-review-entry.jsx"],
    },
  },
  plugins: [
    ...(command === "serve" ? [disableCompleteReviewBootstrapCachingPlugin()] : []),
    react(),
    enforceCompleteReviewPortPlugin(),
  ],
}));
