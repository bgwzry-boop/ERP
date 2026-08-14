# Project Status

Last updated: 2026-08-12 — current baseline remains `V8.306` plus verified attendance/payroll and Deli-gateway hardening.

## Current Verdict

The accepted desktop/mobile review surfaces now use the formal employee, payroll and self-attendance implementation. The local API is still demo and the ERP is not a release candidate or approved production system.

| Dimension | Current truth |
| --- | ---: |
| P0 prototype / core code | `97-98%` |
| V1 readiness | `80-83%` |
| Release gates | `0/4` |
| Production go-live stages | `1/5` |
| Runtime readiness | `5/11` |
| Field evidence | `0/40` |
| Owner signoff | `0/6` |
| Remaining onsite tasks | `59` |

The generated [go-live suite](/Users/xu/Documents/ERP/.erp-local-storage/v1-go-live-suite/latest.zh-CN.md) is authoritative for release numbers. Local tests and prototypes never override it.

## Implemented

- Local preview identity is now explicit and fail-closed: the complete review app owns `bagwin-complete-review-4174 @ 4174`, the root workbench is fixed to `5173`, both Vite configs reject cross-port launches, one canonical launcher starts the review/API pair, and live verification checks app identity, full navigation and API health. Development documents reload when the server identity behind their origin changes.
- The accepted `4174` desktop mounts the formal `PayrollAttendancePage`; employee detail uses the formal profile/account commands, and phone bootstrap reuses `EmployeeAttendanceMobilePage`. Review fixtures and invented wage/punch values are no longer reachable from business routes.
- Employee identity, attendance mapping and payroll remain keyed by stable ERP employee number. Names are display fields only. Departed employees retain audit/history and are excluded from active onboarding.
- Formal payroll covers provider precheck/import, attendance review, closed-natural-month draft generation, audited adjustments, accountant review, management lock, immutable export, payment confirmation and employee history. Missing evidence blocks the run rather than producing zero-hour lines.
- Payroll policy must persist as draft before publication. Published policy, run identity/state evidence, reviewed payroll lines and export audit are immutable through service/repository/database guards in migrations `0039–0041`.
- The official Deli D5FN gateway implements E+ `CHECKIN / checkin_query`, official signing, bounded pagination, `ext_id` mapping, Shanghai work dates, persistent `next_id`, immutable minimal punch cache and separate Bearer auth. Migration `0042` stores cursor/cache atomically; `check_data` is never forwarded or persisted.
- The Deli production preflight is non-mutating and redacted. systemd `ExecStartPre` blocks placeholders, weak/reused identities, non-official upstreams, unsafe bounds, non-PostgreSQL cache, public Node binding, route drift, symlinked env files and group/other-readable secrets.
- D49 still fails closed on incomplete employee payroll/attendance setup, but the wage source is no longer missing. The owner-provided `26年工资 (2).xlsx` has been re-read: 28 employee sheets plus `汇总`, 144 populated payroll-period rows, nine currently repeated hourly job/rate combinations, one separate `送货司机 180元/天` daily-wage mode, retained early-period rate exceptions, and a monthly seniority schedule starting at `满1年 30元` then `+15元/年`. The accepted target remains position-based wage authority: each active employee still needs profile dates, a stable payroll-position link and a real attendance identity; the extracted rate/mode values still need an effective-dated draft/publish workflow before they become formal policy.
- Database/OpenAPI truth is `45 migrations / 100 tables / 206 paths / 469 schemas`. The immutable departure operation timestamp is now separate from the explicit final work date used by attendance and payroll, so a delayed HR entry cannot extend the employment interval. Payroll-line adjustments can now persist up to five authenticated business-owned evidence attachments; owner, payroll run, uploader, file content/type/size and employee identity are validated before the IDs enter audit history. Payroll run, line, adjustment response and employee history are no longer loose untyped objects in OpenAPI. PostgreSQL 16 evidence covers these boundaries, attendance import, payroll concurrency/immutability, export audit, Deli cursor/dedupe/redaction and restore requirements.
- The production deployment manifest is `21/21`, including Node 24, API/health units, graceful shutdown, nginx/static/API wiring, Miniapp integration workers, controlled release/recovery and the Deli gateway startup preflight.

## Hard Blockers

1. D49: the owner will provide birth/hire and related personnel data later. The wage workbook and its job/rate composition are available, but active employee-to-payroll-position links, exact policy effective dates and finance publication are not complete. One account is deliberately enabled for functional testing; 28 active accounts stay pending, while two departed accounts remain disabled.
2. Attendance live: the current punch machine is not assumed to support direct API access. The provider stays disabled for the pilot and formal payroll remains blocked. If a replacement device/provider is chosen, its authorization, adapter, person mapping, HTTPS deployment and first small-window read-only precheck become required; the existing Deli path is not forced.
3. Payroll business: the controlled rule-confirmation workbook still has `0/25` required rules filled; no owner-approved effective policy exists, and no real punches, closed-month coverage, payroll run, formal export or payment have been executed.
4. D50: production PostgreSQL, an independent restore-validation database, attachment/export object storage, real production environment values, migrations `0039–0045`, runtime smoke and backup/restore evidence are absent. The existing Tencent server is staging and cannot be relabelled as production without the controlled release contract.
5. D51–D52: label/dot-matrix printers, CUPS, scanners, physical output and driver real-device/full-order acceptance are absent.
6. D53: field evidence remains `0/40`, owner signoff `0/6`, with V1/V2 boundary, controlled release commit, deployment and rollback still pending. The six added evidence items make a real attendance/payroll closeout mandatory rather than optional.

## Remaining Code Work

- Keep any attendance gateway and ERP provider as separate identities and deployments; add no production secret or employee value to Git, browser storage, logs or chat.
- Import missing employee profile dates and attendance mappings only after the owner supplies them and the controlled workbook passes strict offline review and explicit confirmation. Reuse the already supplied wage workbook for payroll-position/rate drafts instead of asking for the same wage data again; extend the formal policy/run contract with an explicit daily-wage mode before importing the `送货司机 180元/天` standard.
- Preserve fail-closed payroll rules while completing production integration and acceptance; do not replace real attendance with review fixtures.
- Connect the approved payroll-adjustment evidence design to the formal page, then make evidence mandatory for amount-changing adjustments; the additive database/API contract already accepts validated evidence without breaking the current page.
- Continue only justified maintenance and release-gate fixes. AI anomaly/radar work remains V2 and does not replace D49–D53.

## Latest Verification

- The complete core gate passes `117/117`. The current controlled D49 workbook was rechecked with `29` active rows and full `8/8` role coverage, but strict payroll/attendance completeness remains `0/29`; this separates usable employee/role intake from missing profile, wage and Deli mapping data. Payroll/attendance is recalibrated to `93% code / 28% live`; release evidence is `40` items in `7` groups, including the first real attendance/payroll closeout, with zero completed evidence.
- The prior status-document length failure is closed: current files are concise, full 2026-08-12 snapshots and V8.80 archives remain linked, and the original thresholds were not weakened.
- No live Deli request, real attendance/payroll write, production migration, physical print, deployment, release refresh or gate increase was performed.

## Immediate Next Step

Complete the position-based payroll contract from the already supplied wage workbook and keep the one-account pilot isolated. When the owner supplies the remaining personnel dates and selects an API-capable attendance source, complete controlled employee/position/provider mappings and the first read-only real sync before any formal attendance import or payroll draft. Production infrastructure continues only through the dedicated controlled deployment task.

## History

- [Complete status snapshot through 2026-08-12](docs/history/status/PROJECT_STATUS-through-2026-08-12.md)
- [Historical log through V8.80](docs/history/status/PROJECT_STATUS-through-v8.80.md)
