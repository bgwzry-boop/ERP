# Project Status

2026-10-22: staging release integration is in progress on an isolated branch, preserving the verified 2026-10-13 baseline and adding the three October raw-material changes. Publication evidence will be recorded after server validation.

Updated: 2026-10-13. This is a code-integration candidate, not a newly deployed release. V8.306 remains a historical product label.

## Verified Baselines

| Baseline | Immutable commit | Current state |
| --- | --- | --- |
| Remote default | `7888e5efa5a559c0d128b3d512b9f12fee4ffa99` | Unchanged |
| Draft PR #2 | `54ca593827e7028994b4f1bc91982377f3e3f609` | Open draft, 48 commits above default |
| Original local line | `c86f0144666b02b0d1bee3ef7b9fe8d320fa239d` | 64 local-only commits versus 12 remote-only commits |
| Deployed Staging / staging-current | `f0657285ee2159059915126c2bfc8699ee59887b` | Frontend and API release identities match |
| Integration candidate | `codex/full-baseline-integration-20261013` | Own worktree based on deployed Staging; awaiting draft review |

The original histories were backed up as a complete Git bundle before integration. Neither the shared original worktree nor the PR #2 worktree was modified. Archive tags preserve historical branches; no branch was deleted.

## Preserved Contracts

- Production fails closed for local stores, seeds, E2E switches and missing authentication secrets. Demo defaults to PostgreSQL. Local persistence requires an explicit test fixture.
- Signed review sessions and real-handset routing retain operator attribution. Formal production retains normal authentication.
- Raw-material receipt evidence, source page attribution, supplier returns, voided-draft isolation, the maintained 35-colour catalog and audited supplier-colour mappings remain authoritative.
- Fabric defaults to 78gsm; handle strips default to 65gsm and 5cm, with explicit valid source values preserved. Zero-weight rolls cannot become available or be issued; leftover review requires positive weight.
- Lazy pages and styles remain deferred. The inbound layout, state controller and detail component share one current implementation; repository construction, command orchestration and existing transaction boundaries are retained.
- SQL locking, idempotency, paper documents, stock and audit writes were not replaced by simplified transactions. Previously deployed migration files retain their checksum compatibility.

## Validation

- Passed: Linux Node 24 code checks 147/147, raw-material API/page checks, complete-review unit checks 39/39, root/review builds and MinIO round trips.
- Passed: PostgreSQL 16 live checks, core browser scenarios 10/10 and complete-review browser scenarios 2/2. Both remote CI runs passed for integration commit `5bd2f87`; the current head is tracked by [PR #3 checks](https://github.com/bgwzry-boop/ERP/pull/3/checks).
- Root and all four preview package locks report zero audit findings. No forced major-version upgrade was used.
- Local 4174 uses an explicit test fixture and displays `本地修改稿 · 未部署`; review:check verifies app identity, navigation, shell and API health before delivery.
- A macOS 160-read concurrency failure also reproduced on the untouched original local baseline. The unchanged Linux Node 24 test passed all 160 reads and the two-session write/conflict assertions; no request count or assertion was reduced. This is lab evidence, not production capacity acceptance.

## Field And Release Boundaries

The owner confirmed on 2026-10-13 that the label printer is not ready. Physical output, attachment, scanning and the real delivery-note/issue/supplier-reconciliation loop remain pending. Payroll and whole-ERP acceptance remain separate from the approved raw-material-first scope.

The exact first-release entries for supplier-colour maintenance, OCR reparse and draft voiding were repaired without changing operation permissions or transaction guards. The [raw-material handoff](docs/development/raw-material-first-release-handoff-2026-07-18.zh-CN.md) now lists actual inputs and field evidence. A read-only Staging observation confirms PostgreSQL/object storage and release identity; the served full-ERP report still uses an August 29 artifact, so its counters are not a newly refreshed first-release acceptance.

Historical figures of 97-98% code, 80-83% readiness, 0/4 release gates, 0/40 field evidence and 0/6 signoffs are prior-report values, not a fresh 2026-10-13 acceptance. Code integration does not advance them. Existing PostgreSQL/COS resources are known from prior checks; restore validation, target configuration and onsite evidence require a current read-only reassessment.

No default-branch merge, deployment, staging-current update, real payroll write or visibility change occurred in this integration task. A later dedicated release must use a clean pushed full commit and the exact controlled lock, then verify matching frontend/API commit, target, version and digest.

## History

- [Full snapshot through 2026-08-12](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/PROJECT_STATUS-through-2026-08-12.md)
- [Historical log through V8.80](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/PROJECT_STATUS-through-v8.80.md)
