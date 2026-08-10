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

export default defineConfig(({ mode }) => {
  const buildEnv = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  assertRawMaterialFirstReleaseBuildEnv(buildEnv);
  assertControlledReleaseBuildEnv(buildEnv);

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              if (id.includes("/src/features/v1-status/")) return "erp-v1-status";
              if (id.includes("/src/pages/")) return "erp-pages";
              if (id.includes("/src/shared/") || id.includes("/shared/")) return "erp-shared";
              if (id.includes("/src/services/officeV1GoLiveStatus")) return "erp-v1-runtime";
              if (id.includes("/src/services/")) return "erp-runtime";
              if (id.includes("/src/domain/")) return "erp-domain";
              if (id.includes("/src/data/")) return "erp-data";
              if (id.includes("/src/state/")) return "erp-runtime";
              return undefined;
            }
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
    plugins: [react(), controlledReleaseHtmlPlugin(buildEnv)],
  };
});
