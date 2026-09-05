import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export function assertRawMaterialFirstReleaseBuildEnv(env = {}) {
  const runtimeMode = String(env.VITE_ERP_RUNTIME_MODE ?? "").trim().toLowerCase();
  if (runtimeMode !== "production") return;
  const firstReleaseEnabled = String(env.VITE_RAW_MATERIAL_FIRST_RELEASE ?? "").trim().toLowerCase();
  if (firstReleaseEnabled === "true") return;
  const error = new Error(
    "Production frontend builds require VITE_RAW_MATERIAL_FIRST_RELEASE=true while the first rollout is raw-material-only.",
  );
  error.code = "VITE_FIRST_RELEASE_SCOPE_REQUIRED";
  throw error;
}

export function assertControlledReleaseBuildEnv(env = {}) {
  const runtimeMode = String(env.VITE_ERP_RUNTIME_MODE ?? "").trim().toLowerCase();
  if (runtimeMode !== "production") return;
  const target = String(env.VITE_ERP_RELEASE_TARGET ?? "").trim();
  const commit = String(env.VITE_ERP_RELEASE_COMMIT ?? "").trim().toLowerCase();
  const version = String(env.VITE_ERP_RELEASE_VERSION ?? "").trim();
  const lockDigest = String(env.VITE_ERP_RELEASE_LOCK_DIGEST ?? "").trim().toLowerCase();
  if (
    target === "tencent-production" &&
    /^[a-f0-9]{40}$/.test(commit) &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(version) &&
    /^[a-f0-9]{64}$/.test(lockDigest)
  ) return;
  const error = new Error(
    "Production frontend builds require a verified tencent-production release identity from the controlled release lock.",
  );
  error.code = "VITE_CONTROLLED_RELEASE_IDENTITY_REQUIRED";
  throw error;
}

export function controlledReleaseHtmlPlugin(env = {}) {
  const values = [
    ["erp-release-target", env.VITE_ERP_RELEASE_TARGET],
    ["erp-release-version", env.VITE_ERP_RELEASE_VERSION],
    ["erp-release-commit", env.VITE_ERP_RELEASE_COMMIT],
    ["erp-release-lock", env.VITE_ERP_RELEASE_LOCK_DIGEST],
  ];
  return {
    name: "erp-controlled-release-identity",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return values.map(([name, content]) => ({
          tag: "meta",
          attrs: { name, content: String(content ?? "") },
          injectTo: "head",
        }));
      },
    },
  };
}

export function rejectCompleteReviewPortInRootAppPlugin() {
  return {
    name: "erp-reserve-complete-review-port",
    configResolved(config) {
      if (config.command !== "serve" || Number(config.server?.port) !== 4174) return;
      const error = new Error(
        "Port 4174 is reserved for docs/prototypes/raw-material-roll-inventory-review. Start the root ERP workbench on port 5173.",
      );
      error.code = "ERP_COMPLETE_REVIEW_PORT_RESERVED";
      throw error;
    },
  };
}

export function requireExplicitRootWorkbenchPreviewAccessPlugin() {
  return {
    name: "erp-require-explicit-root-workbench-preview-access",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
        const acceptsHtml = String(request.headers.accept || "").includes("text/html");
        const isNavigation = acceptsHtml && requestUrl.pathname === "/";
        const explicitInternalAccess = requestUrl.searchParams.get("internalWorkbench") === "1";
        if (!isNavigation || explicitInternalAccess) return next();

        response.statusCode = 307;
        response.setHeader("cache-control", "no-store");
        response.setHeader("location", "http://127.0.0.1:4174/?source=review-guard");
        response.setHeader("x-erp-preview-guard", "ERP_INTERNAL_WORKBENCH_EXPLICIT_ACCESS_REQUIRED");
        response.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildEnv = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  assertRawMaterialFirstReleaseBuildEnv(buildEnv);
  assertControlledReleaseBuildEnv(buildEnv);

  return {
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("/pdfjs-dist/")) return "pdfjs";
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react-vendor";
            if (id.includes("@ant-design/icons") || id.includes("@ant-design/icons-svg")) return "antd-icons";
            return "vendor";
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [
      react(),
      controlledReleaseHtmlPlugin(buildEnv),
      rejectCompleteReviewPortInRootAppPlugin(),
      requireExplicitRootWorkbenchPreviewAccessPlugin(),
    ],
  };
});
