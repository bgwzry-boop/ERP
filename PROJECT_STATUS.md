# Project Status

Last updated: 2026-08-27 — baseline `V8.306`; the controlled Staging release is `staging-20260827-audit-remediation-r6` at commit `2fb1a899ceb85c68f17273625f5584fab760bbdc`.

## Current Verdict

The complete desktop/mobile review application and API are deployed to Staging under one verified controlled-release identity. Staging is usable for continued business testing, but production has not been promoted and V1 cannot yet be declared complete.

| Dimension | Current truth |
| --- | ---: |
| P0 prototype / core code | `97-98%` |
| V1 readiness | `80-83%` |
| Release gates | `0/4` |
| Production go-live stages | `1/5` |
| Runtime readiness | `7/11` |
| Field evidence | `0/40` |
| Owner signoff | `0/6` |
| Remaining onsite tasks | `58` |

These numbers come from the go-live suite regenerated on 2026-08-27. Code checks and a healthy Staging release do not by themselves advance field evidence, signoff or production gates.

## Implemented and Deployed to Staging

- Controlled release r6 is live on the canonical Staging URL. Frontend and `/api/health` report the same commit, target, version and lock digest; `codex/staging-current` points to the deployed commit.
- The release passed `146/146` tests, `47/47` database migrations, pre/post business-data fingerprint comparison (`98` tables, `679` rows, zero mismatch), `13/13` controlled post-deploy checks and desktop/mobile browser acceptance.
- Passwordless Staging review exchanges the fixed preview identity for a backend-signed session and no longer falls back to the account/password screen.
- Employee-machine management exposes the operational list plus a visual position assignment workbench. Account, personnel, attendance and payroll identity remain keyed by the stable ERP employee number.
- Raw-material mobile OCR supports multi-page review, audited discard/reshoot, supplier colour-to-factory-colour mapping and explicit return-order handling. Voided drafts retain audit evidence but do not enter inventory, payable, reconciliation, search or unfinished counts.
- The factory colour catalog uses the 35 Miniapp-photo-backed standard colours. `云雅绿 / 天池蓝 / 梦幻紫` do not exist; historical aliases normalize to the accepted factory colour names.
- The supplied payroll workbook remains the business source for position names and hourly/daily composition. Formal payroll publication still fails closed until personnel dates, position links, attendance mappings, effective policy and a closed-month evidence chain are complete.

## Infrastructure Truth

- The Tencent Staging server is running and the audited `0600` runtime env file is present.
- PostgreSQL and private COS/object-storage settings already exist on the server. They are configured resources, not purchasing gaps.
- The application lacked a persistent `ERP_V1_GO_LIVE_ARTIFACT_ROOT`, so Staging could not read the generated completion snapshot, task board and evidence pack after release switching; this caused stale values and `0/0` displays.
- The current server-side production-env preflight is `6/12`: database and object-storage wiring are partly satisfied. The remaining blocking work is an independent restore-validation database, printer/CUPS command contract, readiness identities and final controlled production intake—not another server or bucket purchase.
- Attendance integration remains deliberately disabled for the accepted one-person functional pilot until a real provider/API is selected and passes the read-only sync precheck.

## Hard Blockers

1. D49: one employee account is the accepted pilot. Whole-factory payroll still lacks approved profile dates, complete employee-to-payroll-position links, attendance identities, policy effective date and finance publication.
2. D50: configure and verify the independent restore-validation database, finish the production env intake/application contract, run restore evidence and production runtime smoke. Existing PostgreSQL/COS resources must be reused and verified.
3. D51: configure the label/dot-matrix printer allowlists, CUPS/bridge commands and spool directory, then collect physical output and scan-back evidence.
4. D52: complete driver-phone and real-order field acceptance. Review fixtures cannot count as evidence.
5. D53: complete `40/40` evidence items, `6/6` signoffs, the V1/V2 boundary and final production promotion.

## Immediate Execution Order

1. Persist and load the regenerated go-live artifact pack on Staging so the owner page shows the current `58` tasks instead of missing-artifact `0/0` values.
2. Re-run the redacted server-side env audit against the existing PostgreSQL/COS configuration and record only pass/fail evidence; never copy secrets into Git or chat.
3. Add the restore-validation database and printer/CUPS settings through the audited env workflow, then perform non-mutating prechecks.
4. Use recent real raw-material documents for OCR/colour/return acceptance and complete label printing plus scan-back on physical devices.
5. Promote to production only from a clean, pushed immutable commit with a verified `erp-controlled-release-lock-v1`; production remains untouched until those gates pass.

## History

- [Complete status snapshot through 2026-08-12](docs/history/status/PROJECT_STATUS-through-2026-08-12.md)
- [Historical log through V8.80](docs/history/status/PROJECT_STATUS-through-v8.80.md)
