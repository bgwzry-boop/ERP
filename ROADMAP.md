# Roadmap
Last updated: 2026-10-24 (98-item triage and local P1 corrections; no new release). V8.306 remains a historical product label.

## Immediate Work

1. Preserve the existing seven P1 corrections and the six R4 scopes, including newer features, immutable prices and financial/payroll history. The [98-item follow-up](docs/development/erp-unresolved-and-decisions-20261024.zh-CN.md) remains the work and decision index; the [R4 record](docs/development/p1-rules-r4-validation-20261024.zh-CN.md) records exact local verification rather than a release claim.
2. Before ordinary or grouped order correction, void active paper/printing through the existing workflow; reject linked real material consumption and other executed facts. Keep explicit multi-batch/gift allocation blocks rather than guessing quantities. Validate real role/device use after controlled integration.
3. Continue the 13 P2 groups and one P3 group in priority order, including legacy file-level scopes and the old 59 uncommitted entries; review each before any cleanup. Resolve D03 data scope, D04 after-sales scope and D05 formal payroll effective dates/exceptions in their own scope.
4. Gather real printing/scan, source-page, material-issue and reconciliation evidence when equipment is ready. Payroll and whole-ERP readiness remain separately gated. Only a dedicated release task promotes a clean pushed commit with the exact target lock.

## Release Sequence
| Priority | Scope | Completion condition |
| --- | --- | --- |
| D49 | Real employees, permissions, first-password changes, default machines, production env | Eight roles ready; env intake/preflight unblocked |
| D50 | PostgreSQL, restore validation, object storage, deployment, monitoring, rollback | Production first-stage closeout ready |
| D51 | Dot-matrix printer, label printer/media/scanning, driver devices | Print and driver closeouts ready |
| D52 | Real master data and end-to-end business trial runs | Current full evidence catalog accepted in full; historical catalog counts are not current acceptance |
| D53 | Signoff, V1/V2 boundary, fixed Git release and go/no-go | Signoff `6/6`, gates `4/4` |

No code refactor, UI polish, or automated lab check may replace these field gates.

D49 accepted inputs: the owner is confirmed as `徐鹏浩`, retains management, and personally fills Finance / Statement until a dedicated accountant is appointed; the visible number is `001` / canonical `ERP-0001`. V8.211 records the explicitly confirmed pre-launch migration of the prior `ERP-0001` record to stable `ERP-0034` and imports the 31-person controlled intake. V8.212 applies the separate authorization to enable only the owner account with both roles; V8.213 makes high-risk identity confirmation a server-authoritative prerequisite bound to the exact name and complete role set; V8.214 records a separately audited temporary-password issuance without exposing the secret. The other 30 candidates remain disabled. The owner has chosen to defer first-password setup while local development continues; this does not block scoped code/UI/test work, but it remains a hard prerequisite before shared testing, production deployment, or release acceptance. Owner readiness still requires first-password change, expiry creation, and real management + Finance / Statement permission verification. The four silk-screen workers remain fixed one-to-one to `PRINT-01` through `PRINT-04` in stable employee-number order.

## Code Integration And Separate Acceptance

- The integration candidate preserves deployed Staging features, local module boundaries and PR #2 production guards. Validate one current inbound controller, lazy route registration, existing transactions and all store locks before review.
- Raw-material acceptance requires real source pages, audited supplier-colour mappings, confirmed positive roll weights, actual labels/scan-back, issue and supplier reconciliation. The printer is not ready; laboratory fixtures do not satisfy these field gates.
- Payroll remains a separate formal acceptance: owner-supplied position rates, stable employee/provider mappings, first-password completion, month-effective published policy, full closed-month attendance coverage, review and evidence-backed adjustments. The one-person pilot cannot substitute for whole-factory readiness.
- The Miniapp remains a separate public BFF and persistence boundary. ERP owns price publication and office confirmation; imported orders preserve WT source identity and immutable snapshots. It is outside raw-material-first promotion.
- Use existing PostgreSQL/COS resources, verify restore and runtime evidence anew, and keep real environment values outside Git. Production reports only advance from accepted current evidence.
- Historical branches remain archive-tagged and retained. The dedicated release line owns any later default merge, target lock, promotion and staging-current alignment; no local preview is a release.

## V2 Deferred

- Enterprise WeChat archive ingestion and automatic replies.
- Formal whole-factory attendance/payroll rollout and full HR remain separate from existing code capability and the one-person pilot; complete after-sales responsibility and approved payroll adjustments require their own accepted scope.
- The first AI/BI priority is an owner/management `AI operating-anomaly radar`, not generic report prose: detect customer reorder-cycle deviations; bag-product seasonality/lifecycle, inventory pressure, and `recommended replenishment range / do-not-exceed` limits; raw-material demand, shortage/overbuy, supplier lead-time, and purchasing risk; and machine/capacity anomalies. Show observed-versus-baseline evidence, forecast intervals, confidence, impact, possible causes, and deep links; keep deterministic metrics authoritative and AI read-only. Cash-flow, customer concentration, fulfillment bottleneck, margin-erosion, and data-quality insights follow on the same evidence contract. Automatic scheduling/purchasing, route optimization, and deep cost/margin allocation—including task/order-level payroll allocation—remain later work after formal production reporting is stable.

V1/V2 scope still requires formal owner signoff before release.

## History

The complete roadmap through V8.80 is preserved in the [roadmap archive](https://github.com/bgwzry-boop/ERP/blob/84d88b4838469e31b47e37bb90fda23036149404/docs/history/status/ROADMAP-through-v8.80.md).
