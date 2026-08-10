import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig(({ command, mode }) => {
  const buildEnv = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return ({
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
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
    plugins: [react(), controlledReleaseHtmlPlugin(buildEnv)],
  });
});
