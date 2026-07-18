import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeRawMaterialInbounds } from "./rawMaterialInboundRecordService.mjs";

export const rawMaterialInboundStoreKey = "metadata/raw-material-inbounds.json";

export function createRawMaterialInboundLocalStore({ storageRoot } = {}) {
  const root = storageRoot ?? getLocalStorageRoot();
  const filePath = join(root, rawMaterialInboundStoreKey);

  return {
    load({ seedInbounds = [] } = {}) {
      if (!existsSync(filePath)) {
        const seeded = normalizeRawMaterialInbounds(seedInbounds);
        write(filePath, seeded);
        return { rawMaterialInbounds: seeded };
      }
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        return {
          rawMaterialInbounds: normalizeRawMaterialInbounds(parsed.rawMaterialInbounds ?? parsed.items ?? []),
        };
      } catch {
        return { rawMaterialInbounds: normalizeRawMaterialInbounds(seedInbounds) };
      }
    },

    save(rawMaterialInbounds = []) {
      write(filePath, rawMaterialInbounds);
    },
  };
}

function write(filePath, rawMaterialInbounds) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        rawMaterialInbounds: normalizeRawMaterialInbounds(rawMaterialInbounds),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR || join(process.cwd(), ".erp-local-storage");
}
