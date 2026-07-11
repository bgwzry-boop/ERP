import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            if (id.includes("/src/pages/")) return "erp-pages";
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
  plugins: [react()],
});
