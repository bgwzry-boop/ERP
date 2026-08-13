import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { controlledReleaseHtmlPlugin } from "../../../vite.config.mjs";

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

export default defineConfig(({ command, mode }) => {
  const buildEnv = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
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
      ? { "import.meta.env.VITE_ERP_API_BASE_URL": JSON.stringify(buildEnv.VITE_ERP_API_BASE_URL || "/api") }
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
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react(), controlledReleaseHtmlPlugin(buildEnv), enforceCompleteReviewPortPlugin()],
  };
});
