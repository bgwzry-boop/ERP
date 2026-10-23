import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeRawMaterialInbounds } from "./rawMaterialInboundRecordService.mjs";
import {rawMaterialRecordIdentitySuffix} from "../shared/rawMaterialRecordIdentity.js";

export const rawMaterialInboundStoreKey = "metadata/raw-material-inbounds.json";

export function createRawMaterialInboundLocalStore({ storageRoot } = {}) {
  const root = storageRoot ?? process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
  const filePath = join(root, rawMaterialInboundStoreKey);
  return {
    load({ seedInbounds = [] } = {}) {
      if (!existsSync(filePath)) {
        const seeded = normalizeRawMaterialInbounds(seedInbounds);
        write(filePath, seeded, []);
        return {rawMaterialInbounds:seeded,rawMaterialInboundActionReceipts:[]};
      }
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        const rows = parsed.rawMaterialInbounds ?? parsed.items;
        const receipts = parsed.rawMaterialInboundActionReceipts ?? [];
        if (!Array.isArray(rows) || !Array.isArray(receipts) || rows.some(row=>!row || typeof row.id !== 'string' || !row.id.trim()) || new Set(rows.map(row=>row.id.trim())).size !== rows.length) throw new Error('Invalid raw-material store shape');
        if (receipts.some(record=>!record?.scope?.startsWith('raw-material.') || !record.idempotencyKey || !record.requestHash || !record.response?.inbound?.id)) throw new Error('Invalid raw-material action receipt');
        return {rawMaterialInbounds:normalizeRawMaterialInbounds(rows),rawMaterialInboundActionReceipts:receipts};
      } catch (cause) {
        throw Object.assign(new Error('本地原材料存储无法读取，已停止加载；请检查原文件并恢复，不能用演示数据替代。', {cause}), {code:'RAW_MATERIAL_LOCAL_STORE_INVALID',statusCode:503});
      }
    },
    save(rawMaterialInbounds = [], rawMaterialInboundActionReceipts = []) {
      write(filePath, rawMaterialInbounds, rawMaterialInboundActionReceipts);
    },
  };
}

function write(filePath, rawMaterialInbounds, rawMaterialInboundActionReceipts) {
  const text = JSON.stringify({updatedAt:new Date().toISOString(),rawMaterialInbounds:normalizeRawMaterialInbounds(rawMaterialInbounds),rawMaterialInboundActionReceipts},null,2)+'\n';
  mkdirSync(dirname(filePath), {recursive:true});
  const temporary = `${filePath}.${rawMaterialRecordIdentitySuffix()}.tmp`;
  let descriptor;
  try {
    descriptor=openSync(temporary,'wx',0o600);
    writeFileSync(descriptor,text,'utf8');fsyncSync(descriptor);closeSync(descriptor);descriptor=undefined;
    renameSync(temporary,filePath);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
