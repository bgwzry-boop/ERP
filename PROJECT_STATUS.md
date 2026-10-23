# Project Status

Updated: 2026-10-23. Staging, the repository default entry and the owner's main checkout must be proven consistent by the executable gate. V8.306 remains a historical product label, not a deployed release identity.

## Current Verified Release

| Surface | Verified identity |
| --- | --- |
| Repository default / canonical remote branch | `codex/staging-current` |
| Current commit, version and lock | Read live with `npm run release:check`; never maintain a permanent latest SHA by hand |
| Staging frontend and `/api/health` | Target `staging`; commit, version and lock digest must match |
| Main checkout | `/Users/xu/Documents/ERP`, must stay clean on `codex/staging-current` at the verified commit |
| Local 4174 | `本地修改稿 · 未部署`, app ID `bagwin-complete-review-4174`; never a server release |

Current values come from live frontend/API identities and remote refs, not this document. The pre-governance observation on 2026-10-22 was `955bb6055e1cff44a3b212f21754e7a8dc908c42`, version `staging-20261022-raw-material-r1`, lock `a511759603149771950b90fc9d770e2ad546754cb661d75d5d80e4fcdb35d8d2`; preserve it as history only. A cache-busting query does not prove the response's identity. The [controlled release rules](docs/development/controlled-release-governance.zh-CN.md) govern every conversation and target.

## October 23 Local Legacy Integration

The isolated `codex/p1-integration-20261023` task reviewed the remaining 497 actual legacy diffs while preserving newer contracts. The 611-entry ledger retains the prior 114 decisions. The new records classify 384 scoped adaptations, 29 current-contract replacements, 29 historical validations, 46 unfinished interface/recovery scopes and 9 cross-domain scoped reviews. These are commit-record counts, never whole-patch completion or a bug count.

The [review and remediation report](docs/development/legacy-remaining-review-closeout-20261023.html) contains verified fixes, actual test evidence and remaining work. Canonical order editing, hold actions, financial variance/write-off interfaces and some maintenance/recovery flows remain explicit followups. `git-baseline-scope:check` now verifies exact source coverage, report fingerprints and duplicate/missing records. The old tree's 59 uncommitted entries remain untouched. This task has not deployed or advanced the canonical release line.

## Completed Historical Audit

The old local head `c86f0144666b02b0d1bee3ef7b9fe8d320fa239d` and all 64 commits are already ancestors of deployed `955bb605`, through integration merge `0c743f57911172d963b8102ca2b673b4b6e6fe99`. They are not 64 outstanding changes. Of 392 changed paths, 284 retain identical content and 108 evolved in later work; no old file was missing. Replaying those commits would risk overwriting newer implementations.

The owner continues using the original main directory. Historical branches, archive tags and the full Git bundle remain available; feature worktrees are task scopes rather than alternative current projects. The ignored `.erp-local-storage/version-unification-20261022/` directory contains the local audit ledger and backup, not a publishable release source.

## Current Release-Governance Work

- The isolated `codex/release-version-governance-20261022` candidate implements shared rules, `release:check`, `controlled-release:deploy / finalize`, gates in prepare/verify/build/postdeploy and production recovery, plus GitHub checks on every canonical push. Promotion is determined by live `release:check` and the release finalization evidence, not a self-referential SHA in this file.
- Regression coverage includes identity mismatch, unreachable remotes, unpublished candidates, dirty main worktrees, concurrency and retry ordering. Reports contain version facts rather than business data.
- Local review provenance refreshes its Git commit and dirty state while the server remains running, so a main-checkout fast-forward cannot leave a stale startup identity. Failed Git reads remain explicitly unknown/dirty; regression coverage verifies updates and recovery without restart.
- New work fetches and starts from `origin/codex/staging-current`. Existing tasks reconcile differences before integration. Ordinary modification tasks do not deploy or move the canonical branch.
- Preparation checks the clean, pushed immutable candidate and exact target lock. Completion requires matching live frontend/API identities, repository default entry, canonical branch and owner main checkout; an unreadable or mismatched surface blocks a completion claim.
- Only a verified target permits a non-force canonical advance. Dirty, divergent or differently assigned owner worktrees are preserved and reported, never reset or overwritten to manufacture agreement.
- The first tooling transport stopped before switching: its helper passed a full connection URI through PGDATABASE, which the installed client rejected. The helper now uses separate libpq environment fields; read-only verification found 47 matching migration records, zero pending and zero checksum mismatches. The old service/data were preserved and the failed candidate retained.
- New verification issues belong in `01_当前状态与下一步.md`; `02_问题或报错日志.md` remains the historical 2026-10-13 integration record.

## Preserved Contracts And Validation

- Production fails closed for local stores, seeds, E2E switches and missing authentication secrets. Local persistence requires an explicit test fixture; signed review sessions retain operator attribution and formal production retains normal authentication.
- Office receipt entry and the phone flow retain source-page evidence, supplier returns, voided-draft isolation, the maintained factory-colour catalog, audited supplier mappings and one label per physical roll. Shared repositories, orchestration and transaction boundaries remain intact.
- Fabric defaults to 78gsm; handle strips default to 65gsm and 5cm. Zero-weight rolls cannot become available or be issued. Lazy pages/styles and shared inbound controllers remain preserved.
- Verified before governance at `955bb605`: code checks 147/147, complete-review unit checks 39/39, core browser scenarios 10/10, review browser scenarios 3/3, root/review builds and local complete-review identity. These results do not automatically validate newly added release-governance code.

## Field And Release Boundaries

The owner confirmed on 2026-10-13 that the label printer is not ready; no new physical acceptance evidence has been recorded. Physical output, attachment, scanning and the real delivery-note/issue/supplier-reconciliation loop remain pending. The [raw-material handoff](docs/development/raw-material-first-release-handoff-2026-07-18.zh-CN.md) lists required evidence. Payroll and whole-ERP acceptance remain separate from the approved raw-material-first scope.

Historical percentages, gate counts and signoff counts describe prior reports, not new acceptance. Automated tests and a working Staging identity do not create field evidence or authorize formal payroll. The repository visibility has not been changed by this version-unification work.

## Historical Sources Only

These are the 2026-10-13 integration inputs, superseded as current entry points:

| Historical source | Commit / branch |
| --- | --- |
| Former default | `7888e5efa5a559c0d128b3d512b9f12fee4ffa99` |
| Then-draft PR #2 | `54ca593827e7028994b4f1bc91982377f3e3f609` |
| Former deployed Staging | `f0657285ee2159059915126c2bfc8699ee59887b` |
| Integration task | `codex/full-baseline-integration-20261013` |

- [October 22 business release notes](docs/development/staging-update-20261022.zh-CN.md)
- [Full snapshot through 2026-08-12](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/PROJECT_STATUS-through-2026-08-12.md)
- [Historical log through V8.80](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/PROJECT_STATUS-through-v8.80.md)
