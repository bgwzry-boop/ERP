// P2-07 单据抬头 on a database with every migration applied: the default header is seeded from
// the old sheet, the office's edit is saved with an audit log, a stale page is refused, and a
// retried save with the same key does not save twice.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresPrintDeviceRepository } from "../server/printDeviceRepository.mjs";
import { readCompanyPrintProfile, saveCompanyPrintProfile } from "../server/services/companyPrintProfileService.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createPostgresPrintJobRepository } from "../server/printJobRepository.mjs";
import { createPostgresFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { listFulfillmentPickerSuggestions } from "../server/services/fulfillmentPickerSuggestionService.mjs";

const name = `erp-company-profile-${process.pid}-${Date.now()}`;
const docker = args => { const r = spawnSync("docker", args, { encoding: "utf8" }); if (r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
let pool;
try {
  docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break; if (i === 59) throw Error("PG timeout"); await new Promise(r => setTimeout(r, 200)); }
  const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "erp", user: "erp", password: "erp", statement_timeout: 15000 });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const m of migrations) await pool.query(m.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  const workspace = { printDeviceRepository: createPostgresPrintDeviceRepository({ postgresClient: createPostgresPoolClient({ pool }) }) };

  const seeded = await readCompanyPrintProfile(workspace);
  assert.deepEqual([seeded.companyName, seeded.phone, seeded.revision], ["河北禄兴包装制品有限公司", "17367893639", 1]);
  assert.match(seeded.footerNote, /三个工作日内/);

  const body = { companyName: "合成包装厂", address: "合成路 1 号", phone: "0319-0000000", footerNote: "请当面点清数量。", expectedRevision: 1, idempotencyKey: "company-profile-save-1" };
  const saved = await saveCompanyPrintProfile({ workspace, operatorId: "U-OFFICE-A", body });
  assert.equal(saved.companyPrintProfile.companyName, "合成包装厂");
  assert.equal(saved.companyPrintProfile.revision, 2);
  assert.ok(saved.operationLogId);
  const log = (await pool.query("SELECT target_type, action, operator_id, after_json FROM operation_logs WHERE id = $1", [saved.operationLogId])).rows[0];
  assert.deepEqual([log.target_type, log.action, log.operator_id, log.after_json.phone], ["print_template", "save_company_print_profile", "U-OFFICE-A", "0319-0000000"]);

  const replay = await saveCompanyPrintProfile({ workspace, operatorId: "U-OFFICE-A", body });
  assert.equal(replay.companyPrintProfile.revision, 2, "a retried save is not applied twice");
  const stale = await saveCompanyPrintProfile({ workspace, operatorId: "U-OFFICE-A", body: { ...body, companyName: "旧页面", idempotencyKey: "company-profile-save-2" } });
  assert.equal(stale.code, "COMPANY_PRINT_PROFILE_CHANGED");
  const current = await readCompanyPrintProfile(workspace);
  assert.deepEqual([current.companyName, current.address, current.revision, current.updatedBy], ["合成包装厂", "合成路 1 号", 2, "U-OFFICE-A"]);
  // A pickup note for customer A picked up by B: the paper carries the office's header and 提货人：B,
  // B is kept on this pickup and offered next time for this customer.
  await pool.query(`INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,settings_json,created_by) VALUES('PRINT-PICKUP-PAPER','PRINT-PICKUP-PAPER','合成针式机','dot_matrix','system_printer',ARRAY['pickup_note'],'{"driverMode":"system_printer"}','U-OFFICE-A');
    INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) VALUES('PRICE-PICKUP-1','ORD-0629-001-01','confirmation',1,0.36,500,180,'U-OFFICE-A');`);
  const client = createPostgresPoolClient({ pool });
  const services = createApiSharedServiceRegistry();
  const prepare = async () => {
    const w = { ...await createPostgresCoreWorkspaceReadRepository({ postgresClient: client }).loadState(), printDeviceRepository: workspace.printDeviceRepository };
    w.fulfillmentActionTransactionRepository = createPostgresFulfillmentActionTransactionRepository({ postgresClient: client });
    w.printJobRepository = createPostgresPrintJobRepository({ postgresClient: client });
    Object.assign(w, await w.printJobRepository.loadState());
    return w;
  };
  const printed = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { documentType: "pickup_note", printDeviceId: "PRINT-PICKUP-PAPER", pickerName: "印刷工乙", idempotencyKey: "pickup-note-picker-1" } });
  assert.ok(printed.printJob, JSON.stringify(printed));
  assert.equal(printed.printTemplate.fields.companyName, "合成包装厂");
  assert.deepEqual([printed.printTemplate.fields.pickerLabel, printed.printTemplate.fields.pickerName], ["提货人", "印刷工乙"]);
  assert.equal((await pool.query("SELECT receiver_name FROM fulfillment_records WHERE id='F001'")).rows[0].receiver_name, "印刷工乙");
  const after = await prepare();
  assert.deepEqual(listFulfillmentPickerSuggestions({ workspace: after, customerId: "C001" }).items.map(row => row.name), ["印刷工乙"]);
  const tooLong = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: after, fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { documentType: "pickup_note", printDeviceId: "PRINT-PICKUP-PAPER", printAction: "preview", pickerName: "名".repeat(21), idempotencyKey: "pickup-note-picker-2" } });
  assert.equal(tooLong.code, "FULFILLMENT_PICKER_NAME_INVALID");

  console.log(`PASS company print profile PG (${migrations.length} migrations): seeded header, audited save, stale page refused, retry not applied twice; pickup note prints and keeps 提货人.`);
} finally {
  if (pool) await pool.end();
  spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
}
