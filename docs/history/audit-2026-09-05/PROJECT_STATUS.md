# Project Status

Last updated: 2026-08-27 — baseline `V8.306`. The last verified release before this artifact-root rollout was `staging-20260827-audit-remediation-r6` at commit `2fb1a899ceb85c68f17273625f5584fab760bbdc`; the live release identity supersedes this static checkpoint after rollout.

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
- Keep any attendance gateway and ERP provider as separate identities and deployments; add no production secret or employee value to Git, browser storage, logs or chat.
- Import missing employee profile dates and attendance mappings only after the owner supplies them and the controlled workbook passes strict offline review and explicit confirmation. Reuse the already supplied wage workbook for payroll-position/rate drafts instead of asking for the same wage data again; extend the formal policy/run contract with an explicit daily-wage mode before importing the `送货司机 180元/天` standard.
- Preserve fail-closed payroll rules while completing production integration and acceptance; do not replace real attendance with review fixtures.
- Connect the approved payroll-adjustment evidence design to the formal page, then make evidence mandatory for amount-changing adjustments; the additive database/API contract already accepts validated evidence without breaking the current page.
- Continue only justified maintenance and release-gate fixes. AI anomaly/radar work remains V2 and does not replace D49–D53.

## Latest Verification

- A real 810×1440 Renyi delivery-note photo passed the normal 4174 phone flow and the live Tencent Cloud Table Recognition V3 boundary, producing draft `RMI-OCR-31CDD323B116` with the correct supplier, `2026-09-01`, `7 rolls / 666 kg / ¥6,760.90`, five orange-red fabric-roll specifications and weights, plus coffee and sea-blue handle strips normalized to `78gsm × 5cm` without invented length. The provider correctly retained both strip ticket colours; the missing supplier-specific factory-colour mappings intentionally block human review rather than guessing. Re-uploading the same source reopened the same draft without another OCR charge. `review:dev` now loads only the three OCR allowlisted variables into the backend API from the existing mode-0600 local secure file; incomplete or over-permissive credentials fail closed and are never passed to Vite.
- Full automation passes pretest `6/6`, code/build/service checks `146/146`, core Playwright `10/10`, and the complete-review receipt Playwright `1/1`. The added driver flow enters an in-progress delivery, opens the final confirmation, verifies focus and assertive announcement, and proves Escape preserves the entered quantity and returns focus to the trigger. Ordinary `npm test` runs both browser entries.
- Current structure sizes are `App.jsx 124 / OfficeWorkbench.jsx 611 / RawMaterialInboundPage.jsx 780 / ProductionPackingPage.jsx 815 / rawMaterialInboundRepository.mjs 770 / raw-material.css 1591` lines. Local scenario fixtures are now a separate on-demand boundary: the formal `OfficeWorkbench` bundle fell from about `447 KB / 127 KB gzip` to `419 KB / 118 KB gzip`, while the approximately `30 KB / 9 KB gzip` fixture chunk loads only in local fallback mode. The enforced workbench budget is tightened to `430 KB / 125 KB gzip`. Of 411 `check-*.mjs` files, 79 read files and 12 directly read core `src` implementation; remaining file-read checks include legitimate migration, build-artifact and output verification, so implementation-text assertions will continue to be replaced incrementally with behavior coverage.
- The controlled D49 workbook still has `29` active rows and full `8/8` role coverage, but strict payroll/attendance completeness remains `0/29`; this separates usable employee/role intake from missing profile, wage and Deli mapping data. Payroll/attendance remains `93% code / 28% live`; release evidence is `40` items in `7` groups, including the first real attendance/payroll closeout, with zero completed evidence.
- The prior status-document length failure is closed: current files are concise, full 2026-08-12 snapshots and V8.80 archives remain linked, and the original thresholds were not weakened.
- No live Deli request, real attendance/payroll write, production migration, physical print, deployment, release refresh or gate increase was performed.

## Immediate Next Step

Complete the position-based payroll contract from the already supplied wage workbook and keep the one-account pilot isolated. When the owner supplies the remaining personnel dates and selects an API-capable attendance source, complete controlled employee/position/provider mappings and the first read-only real sync before any formal attendance import or payroll draft. Production infrastructure continues only through the dedicated controlled deployment task.

## History

- [Complete status snapshot through 2026-08-12](docs/history/status/PROJECT_STATUS-through-2026-08-12.md)
- [Historical log through V8.80](docs/history/status/PROJECT_STATUS-through-v8.80.md)
