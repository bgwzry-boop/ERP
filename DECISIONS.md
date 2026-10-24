# Decisions

Current decision baseline: 2026-10-22 version unification; V8.306 is a historical product label. Durable workflow invariants remain in AGENTS.md; the prior decision set is preserved in [the 2026-08-12 snapshot](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/DECISIONS-through-2026-08-12.md).

## Release Truth

- `codex/staging-current` is both the GitHub default entry and the only canonical Staging baseline. Its full commit must match the actual frontend and `/api/health`; no conversation-specific branch or old directory is a second current version. The owner's main directory stays `/Users/xu/Documents/ERP`, on this branch when used as the current baseline.
- New modifications fetch the canonical baseline and use their own branch/worktree. Only an explicit integration/release task combines work and promotes a clean, fully pushed immutable 40-character commit under one exact target lock.
- Release completion checks the live frontend/API target, version, commit and lock digest, the remote canonical/default branch, and the owner's main checkout. Missing evidence, network failure or mismatch blocks completion. A canonical ref advances only after target identity verification, never by force; dirty/divergent worktrees are preserved and reported instead of being reset.
- Local `4174` always says `本地修改稿 · 未部署`, with its actual base commit and dirty state. A successful release is delivered through the verified server URL with a fresh commit query; local preview and a page colour are not release evidence.
- The 2026-10-13 default `7888e5e`, PR #2 `54ca593`, original local `c86f014` and Staging `f065728` are historical inputs. The 64 original local commits are already ancestors of deployed `955bb605` through merge `0c743f5`; preserve the bundle/tags and do not replay them as missing work. Current identity is measured again for each release rather than inferred from this snapshot.
- [Controlled release governance](docs/development/controlled-release-governance.zh-CN.md) is the executable workflow contract shared by all chats. Documented rules and automatic gates must change together; code validation alone never proves that a new gate or business change has been deployed.
- Old percentage/gate counts describe old reports. Passing code, API, database or browser tests never creates field evidence or signoffs.
- The owner confirmed the label printer is not ready on 2026-10-13. Build code first; physical printing, attachment and scan-back remain pending.
- The full ERP release order remains `D49 -> D50 -> D51 -> D52 -> D53`; formal payroll acceptance is separate from raw-material-first rollout.
- Keep draft review, integration and deployment as separate actions. Ordinary code validation does not authorize deployment. Change repository visibility only when the owner explicitly requests that change at the time; historical branches remain traceability evidence.
- Demo defaults to PostgreSQL; local stores are explicit test fixtures only. The local 4174 runner uses `--mode test --local-fixture` and visibly reports an unreleased preview.
- Preserve the deployed supplier-return, colour-mapping, voiding, zero-weight and identity contracts while retaining the local 65gsm handle default and PR #2 orchestration. Do not reintroduce duplicate controllers or simplify transactional SQL.

## Employee, Attendance And Payroll

- Stable ERP employee number is the identity key. Names are mutable display fields and must never match attendance, payroll, accounts, assignments or audit history.
- Basic wage is job-based. Each employee links to one stable payroll position that is separate from permission role, workshop and machine. The owner-provided `26年工资 (2).xlsx` is the current business source: hourly rows calculate `工时 ×（基本时薪＋岗位补贴/小时）＋综合绩效＋工龄奖`; the driver position uses a daily-wage mode. The versioned payroll policy must preserve those distinct modes and source job names, while employee-level performance/leave/other adjustments remain explicit audited exceptions with evidence and never become a second personal base-wage authority.
- The current one-enabled-account scope is a functional pilot only. The other active accounts stay pending until the owner supplies personnel data; the pilot cannot satisfy whole-factory payroll readiness.
- The two confirmed departed employees retain history, are excluded from current onboarding and cannot be enabled. Account-disable time is immutable audit evidence, while an explicit final work date is the attendance/payroll boundary; the two must never be conflated. Departed employees remain in any payroll month that overlaps that formal interval so final wages cannot disappear; the 29 active employees require owner-reviewed dates, wage/effective values and external attendance identities.
- Employee import/profile maintenance validates birth-before-hire, wage-effect-not-before-hire and unique paired provider/person identifiers. Blank re-import values preserve existing profile/account data; clearing uses an audited single-record command.
- Employee self-service exposes only the authenticated employee's punches, daily/confirmed hours, exceptions and `截至今日` estimate. Coworker attendance/payroll remains finance/management only; unresolved evidence is excluded and estimates are never final wages.
- Formal payroll readiness is month-scoped and fail-closed: PostgreSQL, a supported real provider, complete profile/payroll-position/attendance mappings for every employee whose employment interval overlaps that month, a published policy containing every used position rate, a closed natural month, complete zero-unmatched import coverage, reviewed attendance and enabled first-password-complete accounts for current active employees are all required.
- Attendance precheck may call the real provider for an explicit half-open range but writes no formal attendance. It returns aggregate validity/mapping/duplicate/import counts only and never exposes people, external IDs, punch IDs, raw payloads, URLs or credentials.
- Formal attendance import revalidates the fresh response. Invalid/out-of-range timestamps, duplicate punch IDs, incomplete or ambiguous mappings and provider failures abort the entire batch before any punch/import write.
- On 2026-10-24 the owner clarified that ordinary employees exclude the fixed China-factory 12:00–13:00 lunch intersection; silk-screen workers do not receive a fixed lunch deduction and instead use actual work and reviewed actual rest. A normal silk-screen day may be explicitly reviewed for rest without forcing all normal days pending. Raw punches, existing reviewed minutes and generated payroll snapshots remain preserved; extra-punch review gates and published wage policy remain unchanged.
- An attendance-day `rejected` review means `暂不计薪`: raw punches and raw paired minutes remain audit evidence, confirmed/payroll minutes are exactly zero, and the day leaves the pending-review queue.
- Payroll policy must be stored as `draft` before the same server-returned version may be published. Published/retired versions are immutable; any rule change creates a new version and digest.
- Payroll draft requires the selected China-factory natural month to be closed and continuously covered by completed, nonempty, zero-unmatched imports. Every employee whose hire/departure interval overlaps the month needs confirmed attendance; future hires are excluded, a departed employee remains in the final month, and punches before hire, after departure or before wage effectiveness block the run instead of being priced silently.
- Draft adjustments are explicit before/after accountant actions with reason and audit. Adjustment evidence belongs to the payroll run, retains the employee identity, accepts at most five authenticated active files and is validated before attachment IDs enter the immutable audit record. Payroll lifecycle is one-way `draft → reviewed → locked → paid`; concurrency conflicts fail instead of overwriting.
- Formal export requires `payroll.export`, is unavailable for drafts, returns one exact run revision/digest and writes an immutable summary audit without duplicating wage lines.

## Office Receipts And Employee Onboarding

- On 2026-10-24 the owner confirmed that office A/B may record and settle an evidence-complete exact payment. The server must verify the current statement revision, receivable, cumulative receipt, zero difference, matching durable payment-channel and customer evidence, and the authenticated operator. Underpayment remains open for separate authorized approval; this restricted path grants no broad allowance, variance or management decision permission. Dedicated code/entry/transaction acceptance remains work and is not implied by this decision.
- Formal employees self-register using a personally verified mobile number. An administrator reviews identity, binds the stable ERP employee record and assigns positions/roles; the pending registration has no business permissions. Legacy administrator-created subaccount tools and existing identities retain compatibility and audit history without becoming a second default onboarding flow. Real SMS integration, account enablement and release remain separate; this decision does not activate registration or bulk accounts.

## Deli D5FN Boundary

- The currently installed punch machine is not assumed to have a usable API. Attendance integration therefore remains disabled for the functional pilot and formal payroll remains blocked. No Deli API purchase or initialization is implied; if the factory replaces the machine/provider, the new source gets its own stable provider key and adapter while preserving the same server-side precheck, mapping, dedupe and audit boundaries.

- Deli D5FN uses the official E+ `CHECKIN / checkin_query` API behind the ERP's replaceable `http_json` provider contract. ERP never owns or receives the Deli App-Secret.
- The official adapter signs `/v2.0/cloudappapi`, uses a 13-digit timestamp and lowercase MD5, bounds pages/timeouts, maps only `ext_id`, and never falls back to name or Deli `user_id`.
- The feed is incremental and begins only after the one-time organization/device initialization. The gateway never calls `checkin_query_init` automatically and cannot claim access to pre-initialization history.
- Migration `0042` atomically persists official `next_id` plus an immutable minimal punch cache. Range precheck/import query the same cache; precheck does not consume a batch and restart never resets the cursor to zero.
- Migration `0043` persists departure time, operator and reason, backfills existing departed rows from immutable operation logs, and supplies the month-scoped employment boundary used by attendance import and payroll.
- Migration `0044` adds the explicit departure-effective date used for attendance and payroll. New departures require the actual final work date; the later account-disable timestamp remains audit-only.
- Only official punch ID, `ext_id`, type and time are retained. Deli `check_data` location/device/person detail is neither forwarded nor persisted.
- App-Key/App-Secret belong only to the separately deployed loopback gateway. ERP holds only the gateway HTTPS URL/token, and all three identities are distinct.
- Production systemd must run the non-mutating redacted gateway preflight before start. Exactly one non-symlink env file with no group/other permissions is allowed; placeholders, weak/reused identities, non-official upstream, unsafe bounds, non-PostgreSQL cache, public Node binding and route drift block startup.
- Passing configuration/adapter/database tests is not live evidence. API authorization, real credentials, operator initialization, 29-person `ext_id` reconciliation, TLS proxy and the first small-window read-only sync remain required.

## Product, Order And Inventory

- A mobile raw-material OCR draft is not abandoned merely because the operator navigates back. The review page must offer explicit discard, continue-review and keep-draft choices. Discard is an audited server-confirmed void, never a client deletion; voided drafts retain source images and operator/time/reason evidence but are excluded from operational inbound, unfinished, search, metrics and supplier-reconciliation views and create no inventory, payable or reconciliation effect.
- A still-pending raw-material OCR draft with strong return evidence may be explicitly corrected from delivery to supplier return by reparsing its persisted OCR table under the audited server command, without another cloud OCR call. Return specification may remain blank; Hongshang/Baihou fabric returns retain the price-affecting `黑白布 / 彩布 / 废布` category and stay blocked only when that category, unit price, amount or other return facts are unresolved.
- ERP is the sole authority for price editing/review/publication. The Miniapp activates only a complete validated version and submitted orders retain immutable price/version snapshots.
- Printing supplements explicitly accepted before the same batch starts use the combined-quantity tier; formal reductions retain each original frozen unit rate and append snapshots. Complete-group correction reviews every current member, distinguishes line voiding from explicitly voiding the listed group, and preserves unchanged split-task quantities. Unknown multi-batch or gift allocation stays blocked; a pricing group is not an original order. Supplemental repricing checks real printing consumption, delivery timestamps and active documents; material issue or bag-making execution alone does not establish printing. Voided historical members are excluded from the current complete batch without erasing their evidence. The existing requirements remain the business authority; local implementation/release evidence is tracked separately.
- Miniapp and ERP keep separate databases. Server-to-server intake is HMAC/idempotent, creates only an intake envelope/review draft/evidence/todo, and office confirmation alone creates formal orders and downstream effects.
- Custom sizes remain order-only: produce and deliver the ordered quantity, create no common-goods master row and retain no finished-goods stock.
- `基础资料 → 成品资料` is the single visible common-goods definition/current-price workbench. Finished inventory is separate and contains only `无纺布袋 / 覆膜袋 → 纯色通货 / 印刷通货` spot stock.
- Finished inventory shows exact `在库` plus one shared allocation structure with exact `可用 / 占用 / 锁定 / 待处理`, rounded available percentage and a semantic segmented bar. Only action-driving exceptions retain a separate written state.
- Factory colour swatches always accompany written colour names and are shared with raw-material inventory. Colour never replaces text.
- Price, stock, order, production, packing, fulfillment, statement and adjustment writes remain server-authoritative, permissioned, audited and transactional; UI confirmation never substitutes for the repository boundary.

## Production, Printing And Driver

- Workshop, packing, warehouse/outbound and driver execution follow the actual device available to each role. Phone flows are dedicated task flows, not compressed desktop tables; office desktop remains management/dispatch/oversight.
- Machine counters are action/cycle evidence only, never qualified output, inventory, fulfillment or chargeable quantity. Formal reporting requires task/order-linked qualified and exception quantities.
- Physical-print trust requires accepted device QA, actual printed job/readback and field evidence. Preview, queued, manual-review or free-text status never opens D51.
- Driver completion requires ERP-owned package scan/navigation/photo/location evidence bound to the authoritative task and assigned driver. Device QA alone never completes delivery.
- Raw-material inbound remains delivery-note OCR plus line review, physical roll count, one label per roll and one-to-one reconciliation before roll availability. Ambiguous rows remain isolated; no example or fabricated value may make stock available.
- Roy’s whole-roll rule is authoritative for raw-material stock. Each physical roll is the stock unit. The roll inventory defaults to available yard stock (`可用`); colour plus width filters show the available count and drill into those rolls. Machine-side and unconfirmed rolls stay out of that default view.
- Raw material is whole-roll in and whole-roll out. Partial issue, split-roll outbound, leftover return, and leftover review back to available stock are disabled. Outbound is scan, choose `1号机` through `9号机`, then confirm; available stock decreases by one roll and the roll becomes `机边领用`, including any leftover that remains on the machine.
- After labels are printed and physically applied, office uses `本单已贴齐/一键入库`. It is blocked unless the printed label count, roll count, and pending stick-confirm roll count are equal and no exception roll remains. Matching rolls become available; exception rolls stay out.

## Runtime And Security

- Production uses strict auth, PostgreSQL and object storage; local/memory/demo fallback is forbidden in production. Secrets and real identities never enter Git, frontend variables, browser storage, logs, generated reports or chat.
- High-risk writes require explicit consequence confirmation, current authenticated permission, server time/operator ownership, idempotency or compare-and-commit where relevant, and immutable audit evidence.
- Production env selection, preview, intake, apply, release refresh and artifact reads are server-owned and redacted. Browser requests cannot select file paths, env values, commands, targets or migration execution.
- Deployment uses Node 24, controlled release identity, graceful shutdown, health checks, repeatable migration/restore evidence and rollback. Templates or dry-runs do not count as production resources.

## Frontend And UI

- The accepted dark/orange PC shell, list-plus-detail workbench and approved phone atlas remain the visual sources of truth. Production-TV is excluded from the current PC/mobile migration unless explicitly reopened.
- Local `4174` has one identity: the complete review app `bagwin-complete-review-4174`. The root workbench is fixed to `5173`; each Vite app rejects the other's port. Review delivery requires the canonical launcher plus an app-id/navigation/API health check, and a retained document reloads if the server behind its origin changes.
- Shared `SemanticTag`, colour tokens and business vocabulary are system contracts. Type, requirement, operational state and assignment remain distinct; text is always present and red is reserved for blocking/exception states.
- Page headings contain the title and real page-local controls only. Repeated subtitles, duplicate facts, decorative KPI strips and universal dashboard templates remain removed.
- Long phone states scroll within their frame; blocking/error/confirmation/result states remain reachable and role boundaries remain explicit.
- Detailed active presentation and workflow decisions live in `AGENTS.md`; this file records the current cross-domain authority and release decisions rather than duplicating the full UI specification.
- Office desktop is the primary raw-material inbound surface: scan or upload the delivery note, review color / width / kilograms, print one 76×130mm label per roll, then complete inbound in one click only when the stuck-label count equals the roll count. The default receiving view is the roll ledger, without step narration or a second document grid. Existing review, print and per-roll attach commands remain the server contract.

## Engineering

- `pretest`, `test`, core and batch checks use the manifest-driven runner; PostgreSQL live remains the final resource-sensitive batch. A narrow test cannot prove a broader release gate.
- Domain rules belong in directly tested services/policies; HTTP composition wires dependencies, permissions and response adaptation but does not own duplicated business rules.
- Production paths fail closed on missing repositories, malformed persisted data, stale snapshots, unavailable integrations and unsafe configuration. Demo compatibility never mutates production truth.
- Dirty-worktree release preparation classifies every file, scans added/untracked text for secrets and keeps staging empty until human review; bulk `git add -A` is forbidden.
- Status documents keep only current truth and links. Full historical logs are archived without deletion.

## History

- [Complete decisions through 2026-08-12](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/DECISIONS-through-2026-08-12.md)
- [Historical decisions through V8.80](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/DECISIONS-through-v8.80.md)
