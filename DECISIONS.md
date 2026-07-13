# Decisions

Last updated: 2026-07-13 (V8.119)

This file lists active durable decisions. Full decision-by-decision history through V8.80 remains in the [decision archive](/Users/xu/Documents/ERP/docs/history/status/DECISIONS-through-v8.80.md).

## Release Truth

- The generated go-live suite is authoritative for release numbers. Current truth is blocked: release `0/4`, runtime `5/11`, evidence `0/34`, signoff `0/6`.
- Work proceeds in strict order `D49 -> D50 -> D51 -> D52 -> D53`.
- Lab automation proves code behavior only; it cannot prove physical printing, real-device behavior, production infrastructure, field evidence, or owner acceptance.
- Production deployment must use a controlled remote repository and immutable verified commit with tested recovery.

## V1 Scope

- V1 prioritizes order, inventory, production, packing, fulfillment, statements, and payment.
- Enterprise WeChat automation, payroll/attendance, after-sales responsibility, advanced BI, auto scheduling/routing, and deep cost/margin remain V2.
- V1/V2 scope requires explicit owner signoff and cannot expand implicitly during release.
- Refreshing the V1/V2 difference brief is informational only. It cannot create boundary confirmation, complete V1 mandatory work, mutate field evidence, or approve a release candidate.

## Runtime And Security

- Runtime mode is explicit. Production fails closed unless PostgreSQL, object storage, strict authentication, and audited secure env inputs are active.
- Request bodies cannot choose authenticated identity. Permissions use one shared role catalog and account-specific extensions.
- Sensitive env values, paths, URLs, tokens, commands, and evidence outputs remain redacted and outside Git.
- Production writes require durable idempotency/revision checks and transaction-backed repositories.
- Operational navigation actions are reference-driven: a todo opens its persisted draft, inventory item, fulfillment, or statement when resolvable; preview actions reuse the real preview contract, and unsupported actions fail visibly without synthetic success messages.
- Todo reference health is server-authoritative and projected as `valid`, `missing`, or `unverifiable`. A missing target blocks navigation/printing and remains visible for office review; unverifiable external references cannot be silently treated as valid.
- Release-candidate refresh precheck and refresh execution remain separate services: every hard gate must be ready before the server-owned refresh command can run, and neither request data nor sensitive paths/values may enter the command contract or browser projection.
- Production go-live precheck accepts env-file sources only from server configuration, overlays values in memory only, and applies full sensitive-text redaction to every stage, blocker, unblock action, evidence item, runtime risk, and release-gate summary before browser exposure.
- D49 readiness is one fail-closed read-only projection across eight formal employee roles and the secure production environment. Demo mode never bypasses it, seed accounts never count as formal, and browser responses never expose employee identifiers, login names, passwords, env paths, connection strings, storage values, or command values.
- D49 action links inherit destination-page authorization. The employee import shortcut is exposed only when `masterData` navigation is authorized; technical operations may inspect readiness without gaining employee-import access.
- Master-data import modals may prioritize the workbook matching their source page, but downloads remain explicit and all workbook options remain available; source focus cannot bypass precheck, review, confirmation planning, or formal-import authorization.
- Formal employee role text is normalized through one shared eight-role alias contract used by frontend precheck and backend review. Unknown roles fail precheck, workshop roles require a default machine, and password expiry is system-generated after the first formal password change rather than imported from Excel.
- Employee name and role are universally required; default workshop and default machine are conditional requirements for workshop roles only. Non-workshop employees must not receive fabricated workshop placeholders.
- Each downloadable master-data module must pass standalone precheck. Price or inventory sheets still require the matching product-spec sheet; partial-template support never weakens cross-sheet product-key safety.
- Downloaded production templates keep import sheets empty and place demonstrations in separate `示例-*` sheets. Empty import sheets and unchanged `示例-请替换` markers are blocking errors; automated fixture rows must be enabled explicitly and are not used by the browser download path.
- Employee number is the required, case-insensitively unique stable key for formal import, account review, password lifecycle, audit, and later profile updates. Missing numbers never fall back to a name/role-derived identity, and duplicate numbers fail in both precheck and execution payload.
- Employee numbers use 1-32 ASCII letters, digits, underscores, or hyphens and start with a letter or digit. The same validation applies at precheck, payload, local transaction, and PostgreSQL boundaries; a database check plus unique `lower(id)` index makes the rule durable across batches.
- Every go-live handoff includes a generated D49 employee-machine workbook with an empty import sheet and isolated example sheet, plus an execution guide. The package never contains real employee data, temporary passwords, or importable seed rows; filled copies are controlled business files outside Git and do not satisfy readiness until account lifecycle gates pass.
- Filled D49 workbooks may be checked by a local read-only CLI before browser upload. Its reports contain only sheet/row/field issues and aggregate role coverage, never employee names, employee-number values, workbook paths, passwords, or staged rows; `uploadAllowed` is advisory and cannot bypass the server-authoritative import workflow.
- Real employee intake drafts stay in controlled Git-excluded storage. Missing stable employee numbers, workshop assignments, or machine bindings are never synthesized; they remain explicit blockers until an authorized owner supplies them.
- Employee import requires stable employee number, name, and role, but workshop/machine assignment is a post-import audited operation. `fixed_machine` stores workshop plus machine, `general_worker` stores workshop only, and `unassigned` clears both. Workshop-role readiness still fails closed without a machine; helper/general-worker work is not forced onto a fake machine.
- Employee-role coverage is informational for partial workbook imports, must persist through review drafts and confirmation plans, and must survive API/process/PostgreSQL reloads. It never substitutes for enabled formal-account readiness.
- Committed employee imports and account lifecycle writes refresh both employee-review and D49 read models. Refreshes are post-commit and independently settled: they cannot turn a committed write into a failed write or run after rejected/cancelled operations.
- D49 account readiness requires lifecycle evidence, not isolated field assertions: pending import and temporary password are blocked, first password change can make a correctly bound role ready, and revocation/restart must return it to blocked. Lab evidence never substitutes for real eight-role signoff.
- A previously ready formal account immediately stops satisfying D49 when locked or expired. Administrator password reset clears lockout but returns the account to temporary-password/first-change-required state; it cannot restore readiness by itself.
- D49 UI never truncates role or environment blockers silently. It always renders the complete eight-role matrix; identical environment summaries may be grouped only when category, label, detail, and next action match, with the original occurrence count retained.
- D49 API projection never truncates sanitized blockers by an arbitrary first-N cap. Every source blocker remains represented; frontend grouping is presentation-only and retains occurrence counts.
- Employee-file role coverage is informational and persists through precheck, review draft, and confirmation plan. Incomplete coverage must not block legitimate batched imports, and it must never be treated as D49 readiness until formal accounts are enabled and pass password, expiry, lock, and machine gates.

## Orders And Inventory

- Source messages retain conversation, sender, timestamp, order, and original text.
- Recognition separates confirmed orders, inventory inquiries, merchant replies, temporary holds, additions/new orders, shortage cancellation, and duplicate candidates.
- Customer aliases are source-scoped; examples include `焦糖米提` and `米白咖提`. Original wording remains traceable.
- Plain `有吗` does not reserve inventory. Explicit `留/要/算上` is required; temporary holds default to same-day 19:30 before cutoff and require explicit future expiry after cutoff.
- Partial shortage cancellation affects shortage lines by default. Pre-confirmation restore is allowed with evidence; post-confirmation additions create a new original order.
- Split confirmation is reviewed and server-authoritative, grouping by customer, original source group, fulfillment, and deadline in one atomic idempotent transaction.

## Product And Production Presentation

- Custom printed orders display `定制印刷`, while the base bag style remains structured detail data.
- Fulfillment summaries use product + size + compact color/handle shorthand + side + quantity + notes, including `白印黑` and `白袋黑提`.
- Inventory states always include text and use consistent available/reserved/out-of-stock/pending colors.
- Machine counters are action/cycle counts only. They are never qualified output, inventory, fulfillment quantity, or chargeable quantity.

## Printing And Driver Evidence

- Fulfillment advances only after trusted printed status from the driver/spool boundary; preview, queue, and manual review are not physical-print proof.
- Printer/label readiness requires real output, alignment, barcode scanning, spool readback, void/reprint, and field evidence.
- Driver completion requires trusted ERP-owned evidence; camera, watermark, physical-label scan, location, navigation, and weak-network behavior require real-device QA.

## Raw Material

- Inbound follows delivery-note photo/OCR, office review, one label per roll/piece, physical attachment, and phone scan/signoff before availability.
- Supplier document numbers are optional; ERP inbound and roll/piece IDs are mandatory.
- V1 issue, split-roll, consumption, leftover return, and review are traceability/inventory-state actions. They do not create finished output or precise order cost/margin allocation.

## Frontend And UI

- P0 uses a narrow navigation rail, page title/action bar, and high-density operational workbenches.
- The approved order-entry frame and hybrid production/packing frame remain visual sources of truth.
- Root legacy CSS is retired. Ownership is tokens, base, shared, shell, components, then feature layers.
- Accessibility states retain visible text, keyboard focus, danger confirmation, and non-color-only status.

## Engineering

- `pretest`, `test`, `core`, `batch-a`, and `batch-b` use one manifest-driven sequential runner. Individual npm scripts remain callable.
- Resource-sensitive checks remain sequential; Batch B ends with PostgreSQL live.
- Status documents keep only current truth and links. Full historical logs are archived without deletion.
- Inventory reservation release rules belong to a command service; HTTP routes only map permission-approved commands to business errors or responses, while repositories retain atomic persistence.
- Dirty-worktree release preparation must expand untracked directories to files, assign every file one ownership group, reject forbidden/sensitive paths, and keep staging at zero until a human reviews each group; no bulk `git add -A` is allowed.
- Git baseline content scanning examines only added lines and untracked text, blocks high-confidence credential formats, and reports path/rule metadata without matched values; synthetic leak fixtures must be assembled at runtime.
- Field-evidence row staging owns evidence/signoff/boundary validation, CSV mutation, draft regeneration, closeout summaries, and response redaction in one service; the API composition root only delegates the authorized command.
- Field-evidence draft generation and validation own intake execution, freshness evaluation, safeguards, and redacted result projection in one service; release refresh must reuse the same pure validation projection instead of duplicating sanitization in the API composition root.
- Current-process production-env precheck must be a read-only service using server-owned env with `envFiles=[]`; request bodies cannot select files or values, and failures return a fixed redacted contract without refreshing release artifacts.
- Production env-file source selection is server-owned and ordered: primary wins, configured fallbacks remain visible but ignored, audit-only input is selectable only for preview, and audit responses expose source variable names/statuses but never file paths or values.
- Production env-file preview may read a server-selected file only after audit passes, overlays values into a cloned environment, never mutates `process.env`, and exposes stage/status metadata without paths, values, raw lines, or exception text.
- Production-env setup runs only the fixed server-side `setup --json` command; it accepts no browser target/import path or env values, never enables force overwrite, and prepared templates never count as real production values or release completion.
- Production-env intake live precheck resolves its env file only from the server-owned setup latest report, requires setup ready, Git-ignore safety, untracked state, `0600` mode, and an existing file, and always uses the fixed intake CSV; browser paths, values, raw errors, and local paths never enter its response.
- Production-env real-value apply reports pass through one projection that allowlists variable identifiers, normalizes counts/statuses, excludes all source/target/intake paths, and applies sensitive-text redaction to labels, findings, and next actions before API exposure.
- Production-env real-value application follows a fail-closed service sequence: the server apply flag, exactly one server-configured fragment, a ready setup target, a passing fragment audit, and a current file-bound dry-run proof must all pass before the controlled merge command runs; request bodies never select files or values.
- Release-candidate refresh may run only after the current server-side refresh precheck is ready; artifact root, API target, driver operator, and env files come from server configuration, request bodies cannot supply command values, and all command-result free text is redacted before API exposure.
