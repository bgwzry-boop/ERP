# ERP Product Requirements

Last updated: 2026-07-05

This is the actionable product truth migrated from the old `设计中小工厂ERP系统` thread.

## Product Goal

Build a factory ERP for small fragmented packaging orders. The system must connect order entry, inventory, scheduling, workshop reporting, packing, delivery/pickup, customer reconciliation, and price-table-aware billing.

The first usable surface is the production board, because scheduling is the clearest differentiator from ordinary inventory or e-commerce ERP.

V1 should prioritize a single-factory, human-controlled, auditable core loop. Customer-group auto-reading / auto-reply, expanded AI/OCR recognition, route / scheduling optimization, deep cost and gross-margin analysis, full payroll, and BI belong to V2 or later versions.

## V1 Product Surfaces

- Desktop office ERP
- Management mobile
- Large TV production board
- Workshop mobile
- Warehouse / outbound mobile
- Driver mobile

## V1 Modules

- Order pool and order entry
- Customer profile
- Price tables and order price snapshot
- Channel/source distinction
- Production scheduling
- Silk-screen work orders
- Bag-making work orders
- Helper material-preparation task pool
- Packing package-detail reporting
- Delivery / pickup / express handoff
- Inventory and leftover material ledger
- Customer reconciliation statements
- Basic business statistics
- Account and permission system

V1 needs account-based permissions rather than hard-coded person names. Permissions should be configurable per account, including order entry, scheduling adjustment, price-table draft entry, price-table review, reconciliation/payment, boss-review access, approval handling, and inventory adjustment confirmation.

Every factory worker should use an individual account. V1 should not use shared person accounts or shared machine accounts.

Different roles should have different permissions, such as office staff, production supervisor, silk-screen worker, bag-making worker, helper / packing worker, driver, HR / personnel, and management.

All operation records should default to the current logged-in account, including workshop reporting, photos, packing, outbound, delivery confirmation, payment entry, price override, and review.

Mobile screens should only show tasks and actions allowed by the current account's role and permissions.

## V1 Surfaces And Permission Matrix

V1 should be organized into six surfaces: desktop office ERP, management mobile, large TV production board, workshop mobile, warehouse / outbound mobile, and driver mobile.

The desktop office home page should be the shared operational todo workbench. It prioritizes flow-blocking items: shipments / pickups due today, quantity differences, labels waiting to print, customers waiting for goods-ready notification, inventory shortages, production exceptions, price approvals, and payments waiting confirmation.

The V1 desktop office main navigation should include `order entry`, `order pool`, `scheduling`, `inventory`, `outbound / fulfillment`, `packing / labels`, `statements / payments`, `customers`, `price tables`, and `master data`.

The desktop office ERP also needs a separate order pool page containing all original orders and order lines, with filters such as pending confirmation, pending scheduling, in production, waiting outbound, waiting statement, and exceptions. The todo workbench handles current actions, while the order pool supports full search and traceability.

P0 must keep the order pool separate from the shared todo workbench. The todo workbench handles items that need action now; the order pool is for full search, filtering, traceability, and status lookup, so ordinary orders do not bury active todos.

The P0 order pool defaults to incomplete orders from the latest 30 days plus orders completed today, with a filter to switch to all orders.

The P0 order-pool main list should display `order lines` as the primary rows, while keeping original-order grouping / filtering above the list. Production, inventory, outbound, fulfillment, and statements all flow by order line, so original-order-only rows would hide per-style status.

P0 order-pool columns should include order number / line number, customer, product / print content, size, color, handle type, quantity, order type, current status, fulfillment method, latest needed time, amount, and exception marks.

P0 order-pool filters should start with customer, order status, order type, fulfillment method, exception flag, date range, statement status, and debt / payment variance flag.

Clicking an order in P0 should open a right-side drawer detail. The top shows status and key actions; sections below show line detail, production, inventory, packing, fulfillment, statement, and operation history.

P0 order-pool actions should stay low-risk, such as view, copy, open detail, and void draft. Key edits should jump to order detail or a dedicated flow; the list should not directly edit production, inventory, amount, or fulfillment-critical fields.

Management mobile should stay lightweight for the owner-mother / management and production management. It should not be a full ERP or complex order-entry surface. It should focus on pending review / approval, price review, large allowances, serious exceptions, debt / overdue debt, production progress, and customer debt.

The production supervisor needs a production-management workbench covering bag-making scheduling, mold-change work orders, production exceptions, machine progress, finished-goods photo return / retake handling, and cross-day task review.

The large TV production board is read-only in V1. Editing actions stay on office desktop and mobile screens to avoid accidental operations. Its first screen should show only machine, current task, next task, size / color, quantity, estimated completion time, and exception marks. It should not show prices, costs, statements, payments, or full notes.

Workshop mobile uses the logged-in account's role and permissions to show the correct home page: silk-screen task pool, current-machine bag-making tasks, helper material-preparation / packing tasks, or technician mold-change tasks.

Workshop task list rows should show task type, machine, sequence, order tail number, customer name or replenishment mark, size, color, handle type, quantity, latest needed time, and urgent / exception marks.

The silk-screen task detail page should show customer, order tail number, print content / shipping display name, bag size / color, print color, one-side / two-side mode, planned quantity, customer notes, and print image / artwork. Actions are `start printing`, `upload setup photo`, `report printed quantity`, and `report exception`.

The bag-making task detail page should show machine, sequence, size, color, handle type, finished-goods style, planned quantity, source type, upstream silk-screen quantity / print photo, and whether finished-goods photo is required. Actions are `start bag-making`, `upload finished-goods photo`, `report today's quantity`, `report completed quantity`, and `report exception`.

The helper material-preparation detail page should show workshop / machine, morning / afternoon / current batch, colors to prepare, width / roll number, estimated rolls, and linked task summary. Actions are `confirm prepared / delivered to machine side`, `material missing / cannot find material`, and `notes`.

The packing task detail page should show customer, order tail number, size / color / print content, actual packable quantity, customer packing requirements, and office notes. It should collect package count, quantity per package, and weight when required. Actions are `submit packing completed`, `insufficient quantity`, `label issue`, and `other exception`.

The technician mold-change detail page should show machine, previous model, target model, planned mold-change time, latest completion time, linked schedule task, and production-management notes. Actions are `start mold change`, `complete mold change`, `cannot complete on time`, and `report exception`.

All workshop task detail pages should keep one unified exception entry, but show reason options by role. Exception handling can choose `continue production` or `pause for confirmation`; notes and photos are optional by default and required only for serious exceptions.

Cross-day tasks should be pinned the next day and show `yesterday completed quantity`, `remaining quantity`, and `continue today`. Bag-making cross-day tasks must record the day's qualified quantity; silk-screen / helper tasks decide this by task type.

Warehouse / outbound mobile is a separate outbound task pool with a short home flow: waiting pick / outbound tasks, prepared goods, quantity mismatch, unable to outbound, and inventory lookup. It should not become a full office backend and should not let outbound workers edit orders, prices, or statement quantities directly.

Driver mobile is only for delivery tasks. It must not let drivers edit orders, documents, prices, inventory, or statements. Its home page should contain today's delivery tasks, task detail, watermark photo upload, optional signed-note photo upload, and complete delivery.

Driver list/detail/load/device-QA/complete/exception actions are scoped to active dispatches assigned to the authenticated driver. Query/body `driverId`, `operatorId`, and `watermarkOperatorId` remain compatibility-only and cannot override authenticated identity. Unassigned tasks and tasks assigned to another driver are not visible.

Driver task states in V1 are `waiting delivery`, `in delivery`, `completed`, and `delivery exception`.

Driver task lists should first follow the manual delivery sequence set by office / outbound handoff. If no manual sequence exists, sort by latest needed time, urgent mark, and creation time. V1 does not do automatic route optimization.

Each driver task list row should use two compact lines: first line `[delivery] customer #order-tail`; second line `address area / package count / quantity / urgent-or-note mark`.

Driver task detail should show customer, contact, phone, full address, navigation action, delivery note number, customer notes, and office notes. It should also show package count, package details, order-line summary, and the paper / electronic delivery-note number. Drivers only check whether goods, packages, and documents match.

Before loading, drivers must check the package-level loading checklist. The system should show package ID / sequence / quantity from real package records when available; when real package rows are not connected yet, it can generate temporary checklist rows from package count and quantity. Drivers cannot confirm loaded until all checklist rows are checked.

Before loading, drivers get a lightweight `confirm loaded` action. If goods, packages, or the note do not match, they tap `loading exception`; the issue returns to warehouse / office handling. Drivers do not change the order or delivery document on the driver screen.

Delivery completion requires a watermark photo, with signature photo optional. The system records driver, completion time, and location automatically; receiver name and notes are optional.

Initial completion and evidence retake must reference persisted attachment records. The watermark attachment must belong to the current fulfillment, have purpose `delivery_watermark_photo`, be an active image, and have been uploaded by the authenticated driver. If a signature photo is declared or its ID is supplied, it must belong to the same fulfillment, have purpose `signature_photo`, and have been uploaded by that same authenticated driver. Boolean flags, URLs, another fulfillment's attachment, or another account's upload cannot substitute for these checks.

Initial delivery completion requires a prior `confirm loaded` transition. The watermark operator is always the authenticated driver. Evidence retake after office rejection updates evidence and returns it to pending review without deducting inventory again or replacing the original delivery time.

Driver delivery completion and office evidence review are separate states. After the driver submits watermarked evidence, the delivery evidence waits for office review; office / management users can mark it `reviewed` or `retake required` after checking the watermark photo, optional signature photo, location, and paper-note context. Driver users must not have evidence-review permission.

V1 delivery exception reasons are `customer absent`, `cannot reach by phone`, `unclear address`, `customer refused delivery`, `package / quantity mismatch`, `temporary delivery change`, and `other`.

The returned duplicate paper-note status can be optionally recorded on completion as `brought back`, `not signed`, `customer refused signature`, or `forgotten / lost`. This does not block delivery completion.

The first page implementation should use `page shells + fake data flows` before connecting real APIs. The goal is to validate the six-surface entry points, task pools, detail pages, and key action paths first. Static sample data or local state is acceptable during the shell stage and should not be treated as the final database structure. Real APIs, authorization checks, and persistence should be connected after the page paths are validated.

Page prototyping and ERD / API drafting should run in parallel. The product should first validate shop-floor and office workflows through page shells and fake data, while drafting ERD / API contracts alongside it. The database and interfaces should be hardened after the page paths stabilize.

The first page implementation sequence should prioritize the desktop office ERP: shared todo workbench, order entry / recognition, order pool, inventory lookup, outbound / fulfillment, and statements / payments. Workshop mobile, warehouse / outbound mobile, and driver mobile should follow after the office-side task sources are usable.

V1 defaults to one factory and one accounting / operational tenant. It should not implement multi-company, multi-store, multi-ledger, or complex multi-warehouse organization in the first version. Warehousing starts with zones and inventory states only.

Development and trial runs should use a test environment / test tenant first. Real data should be imported into the test environment for rehearsal; customer, inventory, price, and permission data should move to the formal database only after major issues are resolved.

The first real sample dataset should contain 20-50 desensitized orders, covering in-stock stock/common goods, out-of-stock stock/common goods, custom printed orders, express / less-than-truckload, driver delivery, self-pickup, underdelivery / overdelivery, and statement/payment variance.

Print-template implementation should start with outbound / self-pickup notes and delivery notes after the user provides the current dot-matrix templates. Express / less-than-truckload labels and statement Excel templates can follow.

The P0 prototype scope is narrowed to six desktop office pages: shared todo workbench, order entry / recognition, order pool, inventory lookup, outbound / fulfillment, and statements / payments.

Workshop mobile, warehouse / outbound mobile, driver mobile, management mobile, and the production TV board should only have fake-data previews / placeholder entry points in P0. Their real interaction loops follow after the office source-of-workflow pages are validated.

P0 order entry / recognition should use rule-based parsing and local fake parsing rather than AI or external APIs. The page keeps a large top text area so office staff can paste or type the whole customer message; the system then recognizes size, color, quantity, fulfillment words, and similar fields into editable order lines below.

P0 inventory lookup should use fake inventory and local reservation simulation, but the fields should match the real target model: size / model, color, handle type, finished-goods style, in-stock quantity, reserved quantity, available quantity, waiting-pickup locked quantity, and pending-handling quantity.

P0 outbound / fulfillment should support self-pickup, driver delivery, and express / less-than-truckload state flows plus document / label previews, but it should not connect to the real dot-matrix printer or label printer yet.

P0 statements / payments should first provide an in-browser statement table, totals, adjustment amount, actual received, debt status, and Excel export. Excel should use the first system-default template, then adapt column order, styling, print settings, and sending habits after the current factory template is supplied.

P0 acceptance should use the 20-50 desensitized sample orders to validate the main process and exception handling, not a complete backend or real APIs.

P0 may start with 30 built-in synthetic business records before the user supplies 20-50 real desensitized orders. The prototype should not block on real sample files before page workflows can be tested.

The P0 synthetic dataset should include 12 customers covering cash settlement, 5-day settlement, 7-day settlement, 15-day settlement, monthly settlement, customers with debt, pickup customers, driver-delivery customers, and express / less-than-truckload customers.

P0 sample orders should cover at least eight categories: in-stock stock/common goods, out-of-stock stock/common goods, custom printed orders, printed stock/common goods, external-processing print orders, self-pickup, driver delivery, and express / less-than-truckload.

Order-recognition test strings should intentionally include non-standard customer wording, such as `3038 red 500 pickup tomorrow afternoon`, `medium horizontal black 1000`, `30*38 red 500 black 100`, and custom-print factory shorthand such as `白印黑`, `白袋黑提`, and `黄袋红提`, so the team can validate whether office correction is efficient.

P0 fake stock must use the real inventory key: size / model + color + handle type + finished-goods style + warehouse zone / state. It must not simplify stock to size and color only.

The P0 inventory lookup page should display the real inventory key: size / model + color + handle type + finished-goods style + warehouse zone / state. It should not group only by size and color.

P0 inventory lookup should default to available stock, reserved / occupied stock, and waiting-pickup locked stock. Pending-handling / pending-scrap stock is collapsed by default so routine order entry and outbound judgment stay focused.

P0 inventory quantity columns should include in-stock quantity, reserved quantity, available quantity, waiting-pickup locked quantity, pending-handling quantity, and estimated / pending-review flag.

When an item is short, P0 should show shortage quantity, possible-substitution hints, estimated replenishment / production suggestion, and copyable customer message text. Possible-substitution hints are references only and do not represent a system promise or automatic substitution.

Similar colors or nearby sizes should appear only in a `reference hints` area. They must not count as available stock, must not support one-click substitution, and must not generate `in stock` customer copy automatically.

P0 inventory detail should show source summary, such as counted inventory, workshop-reported inventory, packing-counted inventory, waiting-pickup locked stock, and estimated inventory, so office staff can judge trust level.

P0 must not allow direct editing of the inventory total. It should only provide a `start inventory correction` placeholder action; stock changes still come from inventory ledgers, confirmed corrections, or business actions.

The P0 outbound / fulfillment page should use tabs for `all`, `self-pickup`, `driver delivery`, and `express / less-than-truckload`. The underlying data is shared; the tabs only change the view, field emphasis, document type, and available actions.

The P0 outbound / fulfillment page should default to items due today, incomplete outbound / fulfillment records, and pending exceptions. Historical completed records should be available through filters rather than occupying the default work view.

P0 outbound / fulfillment list columns should include customer, order / line tail number, fulfillment method, goods / spec shorthand, quantity / package count, latest needed time, current status, and customer-note / office-note markers.

Fulfillment methods may use stable internal API/database values such as `pickup`, `delivery`, and `express_ltl`, but every operator-facing page must show `自提`, `送货`, and `快递快运`. Chinese filters map back to internal values at the request boundary; internal English values must not leak into operational tables.

For custom products, outbound / fulfillment goods specs should use the factory's compact wording: product name + size + compact color spec + print side + quantity + notes. Compact color spec combines bag color with print color, e.g. `白印黑` for white bag printed black, and bag color with handle color, e.g. `白袋黑提` for white bag with black handles or `黄袋红提` for yellow bag with red handles. When both print color and handle color apply, show both, e.g. `白印黑 / 白袋黑提`. Detail views and backend fields should still preserve structured bag color, print color, and handle color values.

The P0 outbound / fulfillment right-side detail drawer should show customer / contact / phone / address, order-line details, inventory source, package / label / document preview, customer notes, office notes, and operation history.

P0 outbound / fulfillment actions should cover `mark prepared`, `complete outbound / fulfillment`, `quantity mismatch`, `unable to outbound`, `print preview / label preview`, and `confirm express / LTL picked up`.

P0 quantity mismatches must not edit quantities directly in the list. Staff should click `quantity mismatch`, enter the actual quantity and a fixed reason, and the system should create an office todo plus operation log.

P0 printing should start as browser-based previews for outbound / pickup notes, delivery notes, and express / LTL labels, with simulated `printed` and `voided / reprinted` states. Real dot-matrix printers, label printers, and final templates are integrated later.

The P0 statements / payments page should default to customers that need current-period statement generation, have unpaid variance / debt, or have payments waiting confirmation. Settled historical customers should be available through filters rather than the default work view.

The P0 statements / payments left customer list should show customer name, settlement cycle type, current receivable amount, debt / overdue marker, payment-waiting-confirmation marker, and last statement date.

The P0 statements / payments right-side detail should be divided into customer summary, current-period orders / line table, totals, adjustments, received amount, variance handling, and operation history.

The customer summary must show `current-period receivable`, `current-period received`, `current-period unpaid`, `historical debt`, and `cumulative debt` separately. Current-period unpaid is receivable minus received with a floor of zero; historical debt comes from the customer debt snapshot; cumulative debt is current-period unpaid plus historical debt. These amounts must not be collapsed into one ambiguous variance / debt value.

P0 customer-facing statement details should summarize by order line. Internal detail can drill down to delivery batches, packages, driver delivery, self-pickup, express / LTL, and evidence records.

P0 statements / payments actions should cover `generate statement preview`, `mark sent`, `mark read receipt`, `record customer confirmation`, `record received amount`, `variance pending confirmation`, `confirm write-off`, and `export Excel`. Statement send records should retain receipt state such as pending, delivered, read, confirmed, or no response.

When a customer pays less than the receivable amount, P0 should default to `variance pending confirmation`. It must not automatically treat the variance as rounding / write-off. Staff should choose unpaid balance, rounding / write-off, statement error, waiting for multiple payments, or other.

When unpaid variance is confirmed as debt carry-forward, the write-off action must not clear that amount. The statement should remain visible in debt / variance filters and be brought into the next statement cycle by default. Only no-variance statements, or statements with a clearing result such as approved rounding / allowance, can move to the settled / written-off state.

P0 export should start with a browser statement table and the first system-default Excel download. The final styling, column order, print settings, and customer-sending habits should be adapted after the factory's current template is provided.

P0 price fixtures should use the confirmed bag size price table and the confirmed silk-screen step prices. Bag prices come from the confirmed size table. The 2026-07-03 silk-screen table uses manual-printing prices of `0.09` yuan per piece for single-sided content and `0.13` yuan per piece for double-sided content, plus machine-printing tiers of `0.09 / 0.08 / 0.06` yuan per piece at 3000 / 5000 / 10000 pieces.

P0 account fixtures should initially include Office A, Office B, boss / management, production supervisor, warehouse, driver, silk-screen worker, bag-making worker, and packing worker, so permissions, task pools, operation logs, and responsibility clues can be tested.

P0 implementation should now shift from requirements questioning to building the six desktop office prototype pages. Do not expand into new modules before these pages are usable: shared todo, order entry / recognition, order pool, inventory lookup, outbound / fulfillment, and statements / payments.

P0 should use frontend-local state and fake data first. React local state should simulate recognition, inventory, reservations, outbound, statement, printing, and payment states. It should not connect to a database, real API, AI service, payment interface, real printer, or final Excel template yet.

P0 left navigation should make only the six desktop office core pages clickable. Other modules should appear as disabled / gray placeholders so users do not mistake them for ready functionality.

As V1 role tools become implemented, packing / labels, raw materials, master data, go-live status, workshop / packing mobile, and driver mobile should not be flattened beside the six office core pages. They belong in a permission-scoped `role tools` secondary group after the core pages; unimplemented modules remain disabled placeholders.

P0 fake data should start with about 30 orders, 12 customers, and enough inventory, todo, package, and statement records to cover in-stock stock orders, out-of-stock stock orders, custom print, express / LTL, driver delivery, self-pickup, quantity variance, and payment variance scenarios.

P0 print and export buttons should open previews or mutate simulated states first. Excel uses the system-default template before the real factory template is supplied, and does not call real devices or external sending channels.

P0 acceptance should be scenario-based. Each core page should cover at least 2-3 business scenarios, such as in-stock stock order, shortage, custom print, express label, and underpayment variance.

After implementation, the local dev server must be started and the prototype checked in the browser at desktop viewport, with narrow viewport checks when useful, to confirm table density, buttons, drawers, dialogs, and text overflow behave acceptably.

P0 layout should use a narrow left navigation menu plus a top current-page title / action bar. It should not use a top main menu as the primary navigation.

P0 visual density should follow high-density SaaS ERP / operational-table conventions, similar to dense Jushuitan-style workbenches. Avoid large cards, excessive whitespace, or marketing-style layouts.

The P0 left navigation should expose the six usable core pages first. Other modules should appear only as `later module` or gray placeholders, so the prototype does not look feature-complete where it is not.

The order-entry page interaction should use a large free-text input at the top and parsed editable table rows below. Common fields such as size, color, quantity, and fulfillment method are edited inline in the table; complex print information, customer notes, and office notes open in a side detail panel.

Inventory lookup colors should be consistent: available is green, reserved / occupied is yellow, out-of-stock is red, and pending-handling / pending-scrap / unavailable is gray.

Statement / payment pages should be customer-first: customer list on the left, with the selected customer's period orders, totals, payment status, debt, and adjustment information on the right.

P0 status colors should be unified across modules: normal blue / green, pending yellow, exception red, completed muted green, and voided gray. Order pools, outbound, statements, and todos should share this same color system.

V1 should prefer ERP in-app camera capture that generates ERP-owned watermark photos instead of relying on an external watermark-camera app as the main evidence source. The watermark should include customer / delivery note or fulfillment record, address or resolved location, capture time, driver account, GPS / location info, and watermark ID. The system should save the original photo, watermarked photo, photographer, capture time, location, linked order / fulfillment record, and upload time.

If mobile browser, Enterprise WeChat embedded browser, camera permission, or location permission issues make in-app capture unavailable, V1 can allow uploading an external watermark-camera photo as a transition fallback and mark it as externally uploaded. External watermark-camera app invocation should not be the primary design because third-party apps may not reliably return the captured image into ERP across phones and operating systems.

The V1 permission matrix should start from role defaults and then allow account-level extra permissions. Default roles include office, management, technical operations, production supervisor, silk-screen, bag-making, helper / packing, warehouse, driver, and HR / personnel. Special permissions can be granted per account, such as price review, printing, payment confirmation, inventory adjustment confirmation, performance / deduction confirmation, and boss-review access.

Runtime environments must explicitly distinguish `demo`, `test`, and `production`. Default local data is partitioned by runtime mode, and demo reset operations must never remove test or production data. Production requires formal employee login, server-side authentication, PostgreSQL, and object storage; seed accounts, legacy identity headers, local memory/JSON/filesystem business persistence, and browser-local write fallback are forbidden. Office users do not receive production-configuration, persistence-evidence, field-evidence mutation, or release-candidate `system.v1_*` actions by default; those actions belong to management or technical-operations roles and must remain auditable.

The V1 first-pass button permission matrix should use these defaults:

- Order buttons: office accounts can create orders, save and confirm, edit orders, and void unscheduled / unproduced orders. Key edits after scheduling or outbound must use change records, exception handling, or void-and-reprint flows.
- Scheduling buttons: office and production management can create scheduling drafts, publish schedules, reorder tasks, insert rush tasks, and create mold-change work orders. Workshop workers only see published tasks.
- Workshop buttons: silk-screen workers, bag-making workers, and technicians can only use role-relevant actions such as start, upload photos, report completed quantity, report exceptions, and pause / continue. They cannot edit orders, prices, or customer data.
- Outbound buttons: outbound workers can complete outbound, report quantity mismatch, report unable to outbound, and look up inventory. They cannot edit order quantity, unit prices, or statement amounts.
- Inventory-adjustment buttons: outbound workers, office staff, and production supervisors can initiate inventory correction. Only office staff or accounts with `inventory adjustment confirmation` permission can confirm it into effect.
- Print buttons: office staff and accounts with `printing` permission can print, reprint, and void old notes / labels. Warehouse, workshop, and driver accounts do not get printing permission by default.
- Payment / statement buttons: accounts with `payment entry` permission can enter payment screenshots / amounts. Only accounts with `payment confirmation` permission can confirm write-off, handle differences, and mark rounding, debt, or overpayment.
- After-sales / responsibility buttons: office staff can create complaint / after-sales records and enter handling outcomes. Production management or permitted accounts can confirm responsible step. Performance / deduction still requires the separate `performance / deduction confirmation` permission.

V1 field-level permissions should also depend on order stage, not just role.

Office staff can edit confirmed orders, but with staged limits. Before scheduling / outbound, they can edit ordinary fields. After scheduling, edits to production-critical fields require change history. After outbound or delivery, historical records cannot be directly edited; changes must go through adjustments, after-sales handling, void-and-reprint, or similar traceable flows.

Production-critical fields include size, color, handle type, finished-goods style, quantity, print / non-print flag, print content, print color, fulfillment method, and latest required delivery / shipment time. These fields affect inventory, pricing, scheduling, packing, and delivery; edits must be auditable and may require voiding / reprinting notes or labels.

Finance-critical fields include bag unit price, print unit price, other fees, adjustment amount, chargeable quantity, collected amount, variance handling, and statement status. These fields affect customer receivables and statements, so normal workshop, warehouse, and driver accounts must not edit them.

Office staff may apply current-order manual price overrides, but a reason is required. Overrides above threshold enter boss review / watch and do not block order flow, production, delivery, or reconciliation.

Warehouse / outbound workers cannot directly change order quantity. They can only report `quantity mismatch` with the actual situation; office staff or another authorized account confirms the handling result, edits the order if needed, voids old notes, or reprints replacement documents.

Workshop workers cannot edit customer order information. Workshop mobile only allows start reporting, photos, quantities, and exceptions. Office staff or production management handles order-field changes.

Management mobile can confirm price versions, inventory adjustments, and performance / deduction items only when the account has the specific permission. Each approval item is visible and actionable only to accounts with the corresponding permission.

The system must retain history for every key-field change: before value, after value, operator, time, reason, and whether any linked paper note or label was voided / reprinted.

## V1 Initial Master Data

V1 master data should start with Excel import plus backend editing, so customers, colors, specs, inventory, employees, machines, and suppliers do not need to be entered entirely by hand.

The first V1 backend-editing surface should use the independent `master data` page to create non-writing maintenance drafts. Customer, price, inventory/spec, and employee / machine records can be searched, reviewed, and submitted as proposed changes, but high-risk data such as prices, inventory, permissions, and employee account state must still become effective only through the confirmation-plan / formal-import path or an equivalent permission-gated review chain.

Each import should retain import batch, operator, import time, source file, and row-level error feedback for correction.

Failed-row correction must not write formal master data directly. The system should allow failed rows to become a new non-writing correction draft that preserves the source execution, source confirmation plan, failure reasons, and correction summary before re-entering the confirmation-plan and formal-import flow.

When failed rows are corrected inline, only rows the user actually edits should count as corrected. Unedited failed rows remain unresolved and must not be treated as fixed merely because a correction draft was generated.

Initial master-data imports should first run in a test tenant or test environment. After fields, error rows, and duplicate handling are confirmed, the same import can be applied to the formal database.

Incomplete customer records may be imported as long as the customer name exists. Bag price table defaults to `price table 1`, print price table defaults to `print price table 1`, and settlement defaults to `cash / not set` until office staff fills in more detail.

The standard color catalog should be imported or maintained before initial inventory. If an inventory import contains an unknown color, that row enters `color pending confirmation` and must not become available inventory for automatic customer promises, outbound, or replenishment decisions.

If initial inventory, sample orders, or size/spec imports contain a model outside the system size table, it enters `special model pending confirmation`. Until confirmed, it should not participate automatically in pricing, inventory, scheduling, costing, or replenishment.

Initial finished-goods inventory may be imported as either `counted inventory` or `estimated / pending review inventory`. Inventory lookup, outbound tasks, and replenishment suggestions must visibly show this trust level so estimated stock is not treated like counted stock.

Imported employee accounts default to `disabled`. An admin or account-management permission user enables accounts in bulk only after checking position, machine, role, and special permissions.

After an imported employee receives a temporary password, the employee must change it on first login before receiving business action permissions.

V1 imported-employee password changes require at least 10 characters, at least one letter, at least one number, no whitespace, and no login name / user ID / employee ID substring.

V1 imported-employee accounts lock for 15 minutes after 5 consecutive failed login attempts. The account remains locked even if the next attempt uses the correct password; an admin temporary-password reissue may clear the lock while invalidating old sessions.

V1 imported-employee active passwords expire after 90 days. After expiry, login returns identity and password-change capability only, with no business action permissions until password change succeeds.

Admins can reissue temporary passwords or revoke employee passwords from the master-data employee account review area. Reissue and revoke both invalidate old passwords and old login sessions; after revoke, the employee cannot continue logging in.

Before the later production-summary sheet is imported, machine capacity may be manually entered as rough daily / hourly output and marked `manual estimate`. The user's later machine summary sheet can then calibrate those baselines.

Import error handling uses risk-based behavior. Ordinary master data such as customers, contacts, and color aliases can import valid rows while outputting an error report for failed rows. High-risk data such as inventory, prices, and permissions should run a full pre-check and become effective only after no high-risk errors remain or an authorized user confirms the batch.

Price-table import is high-risk. It must run a full-table pre-check and require confirmation of price-table number, version, effective date/time, reviewer, and changed values before an account with price-table review permission can approve it. Failed rows must not be skipped while the remaining rows semi-automatically go live.

The first actual V1 master-data templates should be generated in this order: customers, colors / aliases, sizes / finished-goods styles, employees, machine capacity, and initial finished-goods inventory. Suppliers and raw-material batches can follow as the second batch.

The initial customer-profile workbook should use three sheets: `customer entity`, `contacts / phones / addresses`, and `customer notes / preferences`.

The `customer entity` sheet should include customer name, customer short name, customer source, default fulfillment method, statement cycle, payment due rule, linked bag price table, linked print price table, risk state, and whether the customer has an order group.

The `contacts / phones / addresses` sheet should include customer name or customer code, contact name, contact role, phone, address, default order contact flag, default statement contact flag, default delivery contact flag, third-party pickup eligibility, and notes. Contact roles should support customer owner, finance, family, worker, third-party pickup person, third-party print worker, and other.

The `customer notes / preferences` sheet should include customer name or customer code, customer-visible notes, office internal notes, finance notes, packing / fulfillment preferences, common delivery requirements, customer group name / platform / whether used for orders or statements, and notes.

The color library should start from factory standard colors, then map customer names, supplier names, and internal names as aliases. Color aliases help recognition and mapping; they must not allow automatic substitution with similar colors. Any color substitution requires office and customer confirmation through an order-change flow.

The color workbook should use `standard color` and `color alias` sheets. The `standard color` sheet should include standard color name, UI color swatch, applicable material / product types, disabled flag, and notes. The `color alias` sheet should include source type, source object, original color name, mapped standard color, applicable material / product type, confirmed flag, disabled flag, and notes. Alias source types should include customer, customer group, supplier, factory internal, and global.

Sizes and finished-goods styles should be maintained as standard master data, preferably in `size spec` and `finished-goods style` sheets.

The `size spec` sheet should include standard size, customer-facing aliases, horizontal / vertical type, width, height, gusset, common-goods flag, capable machines, default bag-body fabric width, default fabric length, and notes.

The `finished-goods style` sheet should include finished-goods style name, style type such as blank / printed stock / laminated / other, allowed sizes, default normal-handle flag, long-handle allowed flag, enabled flag, and notes. Finished-goods styles must validate allowed sizes, so styles such as 小熊, 喜, 福, and laminated bags cannot be combined with arbitrary sizes.

The standard spec table is shared by inventory, pricing, scheduling, cost formulas, and paste-to-parse recognition. Size rules should not be duplicated separately in each module.

The machine-capacity template should include machine number, workshop, capable sizes, default worker, rough daily / hourly output, and mold-change notes. Machine capacity should first support manually entered rough values, such as daily or hourly output by machine and common size. The user will later provide a production summary sheet containing daily model, speed, and daily output for machines 1-9 from the start of the year to the current date. ERP should support importing or using this history to calibrate machine capacity baselines.

Machine capacity baselines feed estimated completion time, replenishment recommendations, scheduling risk, and capacity statistics. Before historical-data calibration, the UI should mark capacity as manually estimated.

Employee accounts should be initialized from an employee table with fields such as name, phone / login account, position, default role, default workshop, default machine, enabled state, and special permissions. After initialization, reporting, photos, printing, approvals, payment confirmation, inventory adjustment, and delivery confirmation should all bind to the account.

Initial finished-goods inventory should import by inventory item, including size, color, handle type, finished-goods style, warehouse zone / state, quantity, and source note. It must distinguish normal / long handle, blank / printed stock styles, and warehouse-counted versus workshop-reported inventory states rather than importing only one aggregate quantity.

The initial finished-goods inventory template should include size, color, handle type, finished-goods style, warehouse zone, inventory state, quantity, and source note.

V1 supplier and raw-material master data can stay lightweight, but suppliers and material batches should be separate sheets. The `supplier` sheet should include supplier name, contact, phone, address, main material types, notes, and enabled flag.

The `raw-material batch` sheet should include supplier, material type, supplier original color name, factory standard color, width, GSM, total kg, CNY/kg unit price, whether freight is included, inbound date, batch / roll number, photo / OCR source, and notes. Bag costing and gross-margin estimates need supplier / batch pricing, so V1 should not use only one global material price.

## V1 Print Templates And Documents

V1 should first support four print / export outputs: outbound / self-pickup note, delivery note, express / less-than-truckload package label, and customer statement Excel export.

These four outputs cover current physical handoff and customer collection workflows. Other reports, internal statistics, and complex finance reports can come later.

Outbound / self-pickup notes and delivery notes should use the factory's existing dot-matrix printer and current paper stock. V1 should not force A4/A5 or inkjet / laser-printer-style layouts for these formal notes.

The current formal-note dot-matrix printer model is confirmed as `EPSON LQ-615KII`. Per Epson's public specs, record it as a 24-pin impact dot-matrix, 82-column-at-10cpi, flatbed-style printer that supports `ESC/P-K`, `IBM2390+`, and `OKI5530SC` control codes, with USB 2.0 full-speed and IEEE-1284 bidirectional parallel interfaces. Official paper ranges are 101.6-254mm for continuous paper, 90-257mm for single sheets, 0.065-0.32mm thickness, and 1+3 copy capability. V1 outbound / self-pickup note and delivery-note templates, printer-device records, and field QA should test against this model, the current two-part / two-up continuous dot-matrix paper, and real paper alignment. The internal ERP device ID defaults to `PRN-DOT-A`, and the recommended CUPS queue name is `epson_lq_615kii_notes`; neither the model nor the recommended queue name is proof of the actual system-printer queue. Field setup still needs the real queue / printer name, driver name, connection method, paper size, tractor-hole pitch, top-of-form, left margin, and alignment parameters.

As of 2026-07-09, the field print host is Windows 11. The current paper is `two-part, two-up continuous dot-matrix paper`, and a current finished-goods customer delivery-note photo sample has been provided. The sample includes at least customer name/address/phone, contact person, date, document number, line items, specification, color, unit, quantity, bag unit price, print unit price, extended-handle unit price, amount, notes, total, delivery handler, and receiver signature. No alignment issue is known yet, but the exact Windows printer name, driver name, port / connection method, and measured paper dimensions are still pending. This sample is a finished-goods customer delivery note, not a raw-material supplier delivery/sales note.

Dot-matrix templates should prioritize continuous paper / two-copy note usage and high-density tables. They should avoid decorative layouts, oversized type, or card-like blocks that waste space.

The system generates the electronic note number. If the current duplicate paper note has its own paper number, keep a `paper note number` field that can be manually entered or later printed from the template.

Self-pickup notes and outbound notes can share one template, with the title changing by fulfillment method. The core fields are customer, order / line, size, color, handle type, quantity, unit price, amount, notes, and pickup person signature / confirmation.

Delivery notes should use a separate template. Compared with self-pickup / outbound notes, delivery notes should emphasize delivery address, phone number, driver, packages / quantities, customer notes, and office notes.

Multiple order lines can be merged onto one outbound / pickup / delivery note when they belong to the same customer, same fulfillment method, and same fulfillment batch. Different customers, fulfillment methods, or fulfillment batches must not be forced into one note.

Merged printing reduces paper and print operations only. It does not merge order-line state, inventory deduction, delivery records, or statement line handling.

Outbound notes, self-pickup notes, and delivery notes should show bag unit price, print unit price, other fees, and total amount. Non-print orders should not show print unit price, so the note does not contain meaningless fields.

Template fields should be dynamic by order type. For example, non-print lines hide print unit price; express / less-than-truckload labels hide all prices; delivery notes emphasize address and phone.

Line items should show handle type, such as normal handle or long handle. Even when normal handle is the default, showing it in the line helps outbound checking and price explanation.

Self-pickup, outbound, and delivery paper notes default to two copies: one for the customer and one retained by the factory. Signature / signed-photo evidence is optional by default and can become required later only for high-risk cases.

Formal print actions should provide a print preview first. The preview should help office staff catch missing fields, overly long text, too many rows, dot-matrix paper-position issues, or layout problems before wasting paper.

The V1 print driver should provide a non-printing diagnostic that checks whether the command-bridge status directory is writable, whether `queued` / `completed` statuses can be read back by ERP, and whether diagnostic files can be cleaned up. This diagnostic must not call the real print command, expose command paths, expose arguments, expose spool paths, expose print payloads, or replace physical print field QA.

Before V1 print go-live, the system should provide one aggregated readiness gate that combines system-printer configuration, environment preflight, spool readback, label-printer and dot-matrix device records, device driver mode, and latest field QA records. Preview-only mode, missing spool readback, devices still set to `preview_only`, missing QA, or failed QA must explicitly report not ready. The gate can show V1 print readiness only when configuration is complete, required devices are in real system-printer mode, and field QA has passed. It still does not replace real output, paper alignment, barcode scanning, vendor SDKs, physical status protocols, or operator acceptance.

If quantity, price, customer, fulfillment method, or other key information changes after printing, the old note must be voided and a new note printed. Voided history must be retained rather than overwritten, including voiding operator, time, reason, and linked replacement note.

Express / less-than-truckload package labels should continue to hide prices. They show only on-site identification fields such as customer, shipping display name, size/color, quantity, package sequence, phone tail, and barcode / QR code. These labels are for finding and handing off goods, not customer reconciliation. Prices belong in order details, outbound / delivery / pickup notes, customer statements, and permission-controlled finance screens.

V1 statement Excel should start from a system default template and support a customer-send version plus an internal archive version. The customer-send version focuses on the concise `statement summary`; the internal archive version can include `statement summary` and `delivery details / internal details` for traceability, disputes, and split-delivery checks.

V1 print / export template content and layout can be maintained only by office staff, administrators, or accounts with template-maintenance permission. Warehouse workers, drivers, and workshop accounts must not edit templates.

Bag-making workers usually default to their own fixed machines, but V1 should not hard-code a permanent machine-worker relationship.

V1 should support machine shift scheduling: by date / shift, maintain which worker is operating each bag-making machine.

V1 scheduling should stay lightweight: day-level schedule plus temporary substitution, without complex attendance shifts.

Because the factory mainly runs a long day shift, the default can be one shift per day.

If a machine's operator changes on a specific day, office staff or the production supervisor only needs to update that machine's operator in that day's schedule.

When workers rotate, change shifts, take leave, or temporarily cover another machine, office staff or the production supervisor can update the machine-worker assignment for that date / shift.

Workshop work-order visibility should follow the current schedule: an account can see work orders for a machine only when that account is assigned to that machine in the current shift.

Schedule records, actual operator, machine, reported quantity, photos, and timestamps should become the data foundation for later piece-rate / attendance / payroll calculation. V1 records only the foundation data; payroll calculation, morning/afternoon shifts, overtime, and leave-hour details remain later modules.

Current payroll uses punch-clock attendance hours as the base source, with the structure `hours * (base wage + position subsidy) + performance`. The user will provide the current payroll spreadsheet later; payroll fields, import format, performance items, and deduction / adjustment items should be refined from that actual spreadsheet.

Before the payroll spreadsheet is received and confirmed, V1 should not invent a full payroll-slip model. It can prepare the underlying data: attendance hours, employee base wage, position subsidy, confirmed performance / deduction records, production quantity, and responsibility-tracing data for a later payroll module or Excel summary export.

Except for silk-screen machine workers, current employees normally punch four times per day: two clock-ins and two clock-outs. After attendance import, ERP should evaluate expected punch count by role / employee attendance rule and route any missing expected punch record to the HR attendance exception list.

The four-punch baseline maps to four segments: morning clock-in, morning clock-out, afternoon clock-in, and afternoon clock-out. These segments support later calculation of morning / afternoon attendance, fixed lunch-break deduction, and half-day leave.

Start and end times are fixed standard times. The system should maintain fixed standard times by role or employee attendance rule rather than hard-coding one factory-wide schedule, and it must not treat temporary leave as meaning that standard times are flexible.

The four fixed punch times for ordinary employees should be configurable in attendance rules: morning clock-in, morning clock-out, afternoon clock-in, and afternoon clock-out. The exact times should be confirmed later from the factory's current schedule or payroll spreadsheet.

Late arrival and early leave should first be marked as attendance exceptions for HR review, not automatic wage deductions. Deduction rules should be configured only after the payroll spreadsheet and attendance policy are confirmed.

One missing expected punch should not automatically deduct wages or mark the employee absent. It should first enter the HR attendance exception list, where HR handles it using make-up punch notes, supervisor-confirmation rules, and available context.

When an employee has extra punches, ERP must retain every raw punch record without deleting or overwriting. The system should match only the valid punch records to the expected segments and show extra raw punches to HR as context or an exception hint.

Because the factory is in a village and workers may have family or personal errands during the day, ERP must support same-day temporary leave and return punch segments. For example, a worker may punch out at 14:00 for an urgent family matter and punch in again at 16:00. Temporary leave requires the worker to tell management verbally in advance, or ask / explain in the large group before leaving, and receive permission before punching out early.

These temporary leave / return records should be preserved as raw punches, and payroll hours should be accumulated from valid work segments; the 14:00-16:00 away segment is excluded from punch-clock wage hours by default. HR confirms that management permission or large-group leave notice exists and classifies the segment as temporary leave, temporary outing, supervisor-arranged work, or another special handling result. Any special paid-hour adjustment requires an HR confirmation record. The records must not be simply deleted or ignored as extra punches.

V1 temporary-leave reasons should use fixed options: family matter, feeling unwell, outside errand, supervisor arrangement, and other.

Temporary-leave evidence should stay lightweight in V1. HR only needs to mark `verbally told management` or `explained in the large group`; screenshots are not required by default. High-risk or disputed cases can later require notes or attachments.

Work time should be calculated and stored at minute precision. Payroll export can display it as hours or another format matching the existing payroll spreadsheet.

For ordinary employees, the lunch break from 12:00 to 13:00 is eating / rest time. It is outside work time and should not count as paid punch-clock hours.

Payroll exports should display work time as hours with 2 decimal places by default, while retaining minute-level detail internally for traceability of temporary leave, make-up punches, and exceptions.

Silk-screen machine workers use a different attendance-punch rule from other employees. Their default is two punches per day: clock-in and clock-out. V1 should support attendance rules by role or individual employee rather than hard-coding the four-punch rule for everyone.

Late arrival, early leave, and half-day leave are allowed business cases. Because payroll is calculated from actual punch-clock work hours, the backend should record statistics and exceptions but should not apply an additional automatic penalty.

V1 leave types should stay lightweight: personal leave, sick leave, temporary outing, supervisor arrangement, and other.

Overtime has no extra overtime premium or multiplier. If a machine, person, or the whole factory needs to work late, the current process is to announce in the large group that work ends at a specific time. Employees punch out after that notified end time, and the time is counted as normal punch-clock work hours.

Leave and overtime sources should be manually entered or confirmed by HR in V1, not automatically generated from punch records. Staying late does not always mean valid overtime, and missing punches do not always mean leave.

Frequent make-up punches should create a reminder. V1 can default to reminding HR and optionally escalating to management / supervisor when one employee has more than 3 make-up punches in one calendar month; the threshold should be configurable later.

The payroll cycle is the natural calendar month. From the 1st to the 5th of the following month, HR reviews the previous month's attendance, exceptions, performance, and payroll draft. Payroll is released after review is complete.

In the wage formula, both `base wage` and `position subsidy` are hourly amounts: `payroll = total hours * (hourly base wage + hourly position subsidy) + performance`. Example: if an employee has 300 hours in May, is a female bag-making machine worker, has a female-worker base wage of 10 CNY/hour, a bag-making-machine position subsidy of 5 CNY/hour, and 300 CNY performance, payroll is `300 * (10 + 5) + 300 = 4800 CNY`.

Employee profiles should maintain the employee's own hourly base wage and default / current position. Position records should maintain hourly position subsidies. For example, when an employee is assigned as a female bag-making machine worker, the payroll draft uses that employee's base wage plus the bag-making-machine subsidy, not a single wage derived only from the position.

Position, base-wage, and position-subsidy values should be stored with effective-dated snapshots. A later position or wage change affects payroll only from its effective date forward; settled months and historical payroll drafts must not be overwritten by later changes.

Temporary position changes in V1 should not automatically split payroll by daily production task. If a month requires temporary-position subsidy or hour adjustment, HR handles it manually during payroll review with a retained note. After the existing payroll spreadsheet is provided, decide whether more detailed segmented wage rules are needed.

Performance should be manually entered or imported by HR / authorized accounts in V1. It should not be automatically generated from production quantity, responsibility tracing, or exception records.

The existing Deli punch-clock device must become the direct attendance source for ERP payroll. The final target is not long-term manual export / upload. A field screenshot has confirmed the device as `Deli face attendance machine D5FN`; long-lived docs should store only a masked SN such as `DL-D5FN_25907934****18F3`, and the device currently appears online in Deli e+. Deli's official cloud open documentation lists `DL-D5FN` in the supported comprehensive sign-in API device models, so cloud attendance API integration is feasible in principle. Automatic synchronization requires the factory's Deli account to have open-platform permission and App-Key / App-Secret credentials.

The intended ERP experience is: workers keep punching on the existing physical device; ERP automatically syncs, or HR clicks `sync attendance`, to pull Deli punch records; ERP pages directly show latest punches, exceptions, make-up-punch items, hour summaries, and payroll drafts. HR should not need to log in to Deli routinely, export a file, and upload it into ERP.

The factory already uses Enterprise WeChat. Attendance integration can therefore prioritize the Enterprise WeChat ecosystem: employees still punch on physical attendance devices, and ERP pulls raw device punch records through Enterprise WeChat check-in / hardware check-in APIs. Enterprise WeChat can be used for employee identity, address-book matching, and reminder notifications, but employees should view attendance in this ERP / mobile app, not be required to use the Enterprise WeChat attendance page as the main viewing surface.

The employee mobile side should provide a `My attendance` page. An employee can see only their own punch records, today's and current-month hours, missing-punch / make-up-punch / temporary-leave / late-arrival / early-leave states, submitted make-up or exception notes, and their attendance summary plus payroll-draft summary during payroll review. Employees must not see other employees' attendance and must not be able to edit raw punch records. Make-up-punch or exception notes submitted by employees enter HR review.

The attendance device / platform should be treated as a replaceable vendor integration, not hard-coded into the payroll and attendance model. Try the existing Deli D5FN first. If Deli cannot provide open API access, has unsuitable pricing / contract terms, provides incomplete data, syncs unreliably, or cannot meet employee and punch-record automatic sync needs, switch to another attendance platform with an open API. ERP should still use one internal attendance-record, employee-matching, exception-handling, and payroll-calculation model.

When selecting or replacing the attendance platform, verify first that the platform can provide raw punch records, employee or employee-number identity, device / site / organization information, punch timestamp, punch source, device online status, historical backfill, incremental sync or scheduled pull, failure retry, and credential management. Excel / CSV export support is useful only as a fallback and must not replace the open API requirement.

Deli Excel / CSV import is only a transition and emergency fallback, for cases such as API permission not yet opened, API outage, historical backfill, or reconciliation. It must not be designed as the final primary workflow. The system should retain sync source, sync batch, last sync time, sync failure reason, and retry state.

ERP should retain raw punch records, import batch, source file or API source, employee matching result, exception notes, and manual correction records instead of overwriting raw attendance data.

The initial payroll module should generate a payroll calculation draft or Excel summary only. Final payroll release requires human confirmation. Late arrival, early leave, leave, overtime, missed punch, manual punch correction, performance, and deduction rules should be refined after the current payroll spreadsheet and attendance management rules are reviewed.

Attendance exceptions should be handled by a dedicated HR / personnel account. This includes missed punches, make-up punch handling, abnormal punch records, employee matching exceptions, and payroll review reminders. HR-confirmed attendance results feed the payroll calculation draft. Items that make performance or deductions final should still require `performance / deduction confirmation` permission unless the HR account is explicitly granted that permission.

Missed-punch or make-up-punch requests should normally be initiated by the employee or supervisor with a reason. HR reviews, confirms, and archives the result; HR does not need to infer every shop-floor reason without input.

Routine exceptions such as ordinary missed punches, forgotten punches, and device recognition failures can be handled directly by HR. Higher-risk cases, such as repeated missed punches, unusual-time make-up punches, cross-day make-up punches, or records that conflict with schedule / production reporting, should require supervisor confirmation or an added explanation.

Payroll review reminders should go to HR first. If unresolved attendance exceptions or an unchecked payroll draft remain close to the payroll settlement date, the system should escalate to management / finance or accounts with payroll-settlement permission.

HR does not receive performance / deduction final-confirmation permission by default. Performance deductions, responsibility deductions, or any final wage deduction still require a management account with `performance / deduction confirmation` permission. If HR should later confirm deductions, that permission must be granted explicitly and the confirmation record retained.

`Price-table review` permission can be assigned to multiple management accounts. It should include the actual price decision maker by default and can include backup approvers.

## V1 Core Data Model Summary

One customer order should create one original order. Production, inventory, packing, fulfillment, and reconciliation primarily flow by order line.

Orders and fulfillment documents must preserve snapshots of the confirmed customer, contact, phone, address, and fulfillment method. Later edits to the customer profile must not overwrite historical documents.

Finished-goods inventory is keyed by `size / model + color + handle type + finished-goods style + warehouse zone / state`.

Examples:

- `30*38 red normal handle blank bag`
- `30*38 red long handle blank bag`
- `25*32 red bear printed stock bag`

These are three different inventory items.

Inventory quantities should at least distinguish on-hand quantity, reserved quantity, available quantity, waiting-pickup locked quantity, and pending-handling / scrapped quantity.

Order lines preserve price snapshots split into bag price, print price, other fees, adjustment amount, and final receivable.

Packages must link to order lines and store package sequence, quantity, weight, label ID, and status.

Example:

- `1/2 500 pcs`
- `2/2 510 pcs`

Self-pickup, driver delivery, and express / less-than-truckload should all generate delivery records. The paper voucher differs by fulfillment method, but month-end reconciliation is unified from ERP delivery records.

Workshop reporting records link to order lines, production tasks, machines, operators, time, quantity, photos, and exceptions.

Customer-facing statement summaries show order-line rows. Internal records keep delivery-batch details.

Core V1 tables should first cover customers, original orders, order lines, inventory, inventory ledger, price snapshots, production tasks, workshop reports, packages, delivery records, statements, payments, and after-sales / exceptions.

Payroll, deep cost accounting, and automation bots are later extensions and should not be forced into the first core data model.

### V1 API And Database Boundaries

Quantity fields belong to their source records and must not overwrite each other.

Original ordered quantity belongs to the order line. Workshop reported quantities belong to workshop report records. Packed quantities belong to packing / package records. Actual delivered quantities belong to delivery records. Chargeable quantities belong to price snapshots, statement lines, or amount-calculation records.

The UI may summarize these quantities for progress display, but later-stage quantities must not overwrite earlier-stage source records.

Example: original ordered quantity is `1000`, silk-screen reports `1020`, bag-making reports `1005`, packing submits `1005`, actual delivery is `1005`, and chargeable quantity is `1000`. All values must remain traceable.

When a production report is completed, only the manually confirmed qualified quantity may increase finished-goods inventory and create the order-line reservation. Machine count / cycle count is evidence and production telemetry only; it must not directly create inventory, fulfillment quantity, chargeable quantity, or payroll quantity.

When packing is completed, the system records the packing task completion, package IDs, and package details, and may move the order toward label printing or express/LTL pickup confirmation. Packing completion itself must not deduct inventory or enter reconciliation; inventory deduction still happens only at fulfillment completion or express/LTL pickup confirmation.

Inventory current totals must not be directly edited. Every increase, reservation, release, outbound, return, stocktake correction, pending handling, or scrap action creates an inventory-ledger entry, and current inventory is derived from or synchronized with that ledger.

Inventory-ledger entries should include inventory item, quantity change, direction, source type, source document / line ID, operator, confirmer when applicable, timestamp, reason, and notes.

Every key action writes an operation log: actor, time, page / surface, business object, before state, after state, and reason.

Key actions include formal order creation, production-critical order edits, schedule publication, workshop reporting, photo upload, packing, outbound, express pickup confirmation, driver loading / delivery completion, note / label generation, voiding and reprinting, price review, payment confirmation, inventory adjustment confirmation, after-sales handling, and responsibility confirmation.

Photos and files use one attachment table. Signature images, watermarked delivery photos, silk-screen photos, finished-goods photos, payment screenshots, customer screenshots, raw-material inbound photos, and similar files link back to orders, order lines, production tasks, workshop reports, packages, delivery records, payments, after-sales records, or raw-material inbound records through business type and business ID.

Attachment records should include file type, business purpose, original file / processed file, uploader, photographer when different, upload time, capture time, source device / source method, watermark data when available, OCR result when available, and voided / replaced state.

Evidence attachments such as payment proofs are deduplicated by `business type + business ID + purpose + SHA-256 content digest`. Retrying one upload must replay its idempotent result. Uploading the same content again should add a reuse audit action without storing the file or creating a second business proof. Historical duplicate metadata remains available for audit, while business lists show only the canonical attachment.

V1 attachment uploads should be constrained by business purpose. Payment screenshots must be images up to 8 MB. Delivery watermark photos, signature photos, and custom printed finished-goods photos must be images up to 12 MB. Statement customer-confirmation attachments may be images or PDFs up to 12 MB. Other generic attachments default to images, PDFs, spreadsheets, or documents up to 15 MB. Attachment storage should have a pre-launch runtime preflight that confirms the active storage adapter is configured, writable, readable, digest-consistent, and able to clean up its diagnostic object without exposing access keys, secrets, authorization headers, or session tokens. Virus scanning, automatic image-quality checks, resumable uploads, and real object-storage acceptance can be added on top of these baseline rules.

Order lines preserve bag price snapshot, print price snapshot, other fees, manual override reason, adjustment amount, and final receivable. Later price-table changes must not modify historical order prices.

Price snapshots should link to the matched price version, customer price table, order time / price effective time, and manual override record, so future statement checks can explain why that price was used.

Formal order quantity adjustment must not overwrite the original price snapshot created at formal-order confirmation. The system should create a `quantity adjustment price snapshot` or equivalent amount-calculation record, preserve the original unit-price basis, recalculate final receivable from the new chargeable quantity, and record previous quantity, new quantity, reason, operator, and time. If statement lines or a statement already exist for that order line, the adjustment transaction should update the affected statement-line amount and statement receivable / variance so the order pool, printed documents, and reconciliation stay consistent.

Outbound notes, delivery notes, self-pickup notes, and express / less-than-truckload package labels need electronic document records with version, print batch, print state, and void / reprint history.

When a new note or label is reprinted, the old version is not overwritten. It is marked voided or replaced, with voider, void time, void reason, linked new version, and reprint reason.

Office todos, inventory exceptions, quantity variances, waiting customer notification, waiting print, payment confirmation, customer confirmation, and review/approval tasks use one todo table, with business type deciding available actions and handling logic.

Todo records should include todo type, linked business object, priority, state, creation source, created time, due / reminder time, actual handler, handled time, result, and notes.

The first V1 API phase should cover only the core capabilities required by page shells and main flows: order drafts / formal orders, inventory lookup / reservation / release, scheduling tasks, workshop reporting, packing packages, outbound and delivery, statements and payments, attachment upload, and operation logs.

Payroll, deep cost accounting, Enterprise WeChat automation, complex profit allocation, and advanced forecasting may keep extension points but are not required in the first API phase.

### V1 ERD Implementation Rules

Business documents should use readable numbers while the database still keeps internal primary keys. V1 defaults are: original orders use `ORD-YYYYMMDD-sequence`, order lines append `-01`, `-02`, packages use `PKG-...`, delivery records use `DLV-...`, statements use `STMT-...`, and payments use `PAY-...`. On-site lists and paper documents may show only customer name, document type, and tail number.

Customer names are not globally unique. The system supports customer aliases, contacts, phones, and addresses. Repeated contacts or phone numbers should trigger a suspected-duplicate prompt, but office staff or an authorized account must manually merge or link records.

Finished-goods inventory summary uniqueness is based on `standard size / model + factory standard color + handle type + finished-goods style + warehouse zone + inventory state`. Customer color wording, supplier color wording, and other aliases are used only for recognition and mapping; they must not become inventory keys.

Attachments use one attachment table linked by `business type + business ID + purpose`, such as artwork, finished-goods photo, payment screenshot, watermarked delivery photo, signature photo, or raw-material inbound photo. In normal use an attachment has one primary business object; if a file must be reused by multiple objects, an attachment-link table can preserve those references.

Business commands must not trust an attachment ID merely because it exists. Finished-goods photo registration requires an active image attachment owned by the current production task, with purpose `finished_goods_photo`, uploaded by the authenticated workshop operator; review revalidates task ownership, purpose, and image state. The authoritative attachment file name cannot be overridden by the registration request. Delivery evidence follows the same contract. Payment and variance evidence must be active image attachments owned by the current statement, with purpose `payment_screenshot`, and have an authenticated uploader. Customer-confirmation evidence must be owned by the current statement, have purpose `statement_customer_confirmation`, be an active image or PDF, and have an authenticated uploader. The uploader and the current recording operator may be different authorized accounts so office-upload/finance-record collaboration remains possible. Write-off itself does not persist attachments; evidence must first belong to a payment or variance record. Inventory-correction draft creation rejects non-empty attachment IDs until a reachable create-draft-then-upload-and-link flow is implemented.

Formal business documents should not be hard-deleted by default. They can be voided, closed, or replaced, with reason, operator, timestamp, and replacement link retained. Recognition-error drafts and test drafts can be voided without entering formal business statistics.

Key business records should store both `business occurred time` and `system recorded time`. For example, an express / less-than-truckload pickup confirmed the next day can backfill the actual pickup date to the previous evening while preserving the next-day system confirmation time.

Excel imports should run a pre-check first and return error rows and duplicate prompts. Master-data date fields such as effective date and stocktake date should be normalized to `YYYY-MM-DD` before staging, including common Excel / WPS serial-number date cells, while quantities, unit prices, inventory counts, and machine counts must never be reinterpreted as dates. Imports must not automatically overwrite existing master data. Duplicates should be skipped, merged, or inserted only after office staff or an authorized account chooses the action.

Operation logs focus on actions that affect money, inventory, production, fulfillment, customer confirmation, responsibility, or auditability: key order-field edits, inventory ledger entries, price / override changes, payment confirmation, note or label void-and-reprint, inventory adjustment, after-sales handling, and responsibility confirmation. Ordinary view-only actions do not need operation logs.

## Review And Approval Queues

V1 should distinguish `review / watch` items from `approval` items so reminders are not mixed with required confirmations.

`Review / watch` is a non-blocking reminder list, not an approval workflow.

Examples:

- customer debt above threshold
- overdue customer debt
- strong customer risk hint
- large rounding / write-off
- large after-sales compensation or allowance
- current-order manual price override above threshold
- abnormal discount / allowance above threshold

`Review / watch` should not block order entry, scheduling, production, outbound, delivery, statement generation, or payment recording by default. Management can inspect the item and then manually decide whether to chase payment, pause cooperation, or handle the customer specially.

`Approval` is a queue where the related item cannot take effect until an authorized account confirms it.

Examples:

- price-table version review before publishing / becoming effective
- inventory adjustment confirmation
- performance / deduction confirmation

`Approval` should only block the related item itself, not unrelated business flow.

Examples:

- after office staff enter a price-version draft, it enters `approval`; the new price version becomes effective only after an authorized mobile confirmation, but existing-price orders can still continue through production and delivery
- when after-sales responsibility is recorded but performance / deduction is not confirmed, the deduction result cannot enter payroll settlement, but after-sales supplemental shipment, exchange, or customer reconciliation can continue

When multiple authorized accounts receive the same `approval` item, V1 should use `any authorized handler completes it`. Do not require multi-approver signoff.

The first successfully submitted handling result that passes permission validation becomes the final result for that approval item. Other recipients opening it later should see the handled state and must not be able to confirm or return it again.

Examples:

- if price-table approval is pushed to the actual price decision maker and a backup approver, and the decision maker taps `confirm correct` first, the approval is complete; the backup approver later sees `confirmed by X at time Y`
- if the backup approver taps `return for edits` first, the approval returns to draft; other approvers later see `returned`, return handler, return time, and return reason

Both queues should store item type, trigger source, linked customer / order / amount, submitter, submitted time, handler, handled time, handling result, and notes.

After a `review / watch` item is viewed, V1 should record a lightweight handling result, but should not turn it into a complex approval workflow.

Recommended V1 handling results:

- `viewed, no action needed`
- `customer contacted`
- `continue follow-up`
- `convert to approval`
- `pause cooperation / warn before order entry`

Examples:

- `viewed, no action needed`: customer has 8,000 CNY debt, but management knows this customer normally settles this way
- `customer contacted`: overdue debt has already been chased by phone or WeChat
- `continue follow-up`: customer says they will pay in two days, so the system keeps a later follow-up reminder
- `convert to approval`: after-sales compensation is large and needs confirmation of discount amount or performance / deduction
- `pause cooperation / warn before order entry`: customer risk is high, so future order entry keeps showing a strong warning, but V1 still does not automatically forbid order saving

V1 can reserve a stricter `management confirmation required before order acceptance` customer status, but it should be off by default and rarely used.

Only accounts with `boss-review` or `customer risk handling` permission can set or remove this stricter status. Normal office staff cannot set or remove it.

When a customer is marked as `management confirmation required before order acceptance`, office staff can save an order draft / pending-confirmation order, but the order cannot move to accepted, scheduled, outbound, or delivered until authorized management confirms.

When management confirms a pending-confirmation order, V1 only needs two actions: `accept order` and `reject order`.

After `accept order`, the order moves from pending confirmation to accepted and continues the normal order flow.

After `reject order`, the order is closed / cancelled and must not enter production, inventory reservation, outbound, or reconciliation.

This confirmation should be handled at the current `original order` level, not per split order line / sub-order.

If the customer relationship is already broken or management has clearly decided not to cooperate, management can directly `reject order`, closing / cancelling the whole original order.

Example: a pasted customer message produces three size / color order lines. If `management confirmation required before order acceptance` is triggered, management still confirms or rejects the single original order, not each line separately.

The management confirmation record should store confirmer, confirmation time, result, and reason / notes.

Example: if a customer has major debt disputes or severe unresolved after-sales conflict, management can temporarily mark this status. When office staff enter a new order, the system pushes it to authorized management to confirm whether to accept the order.

Example accept reason: `customer promised to pay today; allow order`.

Example reject reason: `debt dispute unresolved; do not accept order for now`.

Normal office staff must not be able to remove `pause cooperation / warn before order entry`. They can see the strong warning during order entry, add notes, or forward the issue to management.

Only accounts with `boss-review` or `customer risk handling` permission can remove `pause cooperation / warn before order entry`.

Removal must record remover, removal time, removal reason, and linked evidence / notes.

Example: after the customer clears debt, management taps `remove warning`; future order entry no longer shows the pause-cooperation strong warning for that customer.

`Approval` items must be actively pushed to mobile accounts with the matching approval permission because they affect items such as price-version effectiveness or performance / deduction confirmation.

Notification recipients should be matched by permission, not by hard-coded person names.

Examples:

- price-table approval should push to all accounts with `price-table review` permission and notifications enabled
- performance / deduction approval should push to all accounts with `performance / deduction confirmation` permission and notifications enabled
- severe debt / overdue debt or severe after-sales compensation review should push to accounts with `boss-review` permission and notifications enabled

If someone is resting, on leave, or temporarily not handling items, the office can disable that account's notifications or adjust permissions. System routing still resolves recipients by permission.

Even when a notification is pushed by permission, the handling action must still validate the matching permission. Receiving a push alone must not grant processing authority.

If two approvers submit almost at the same time, the system should accept only the first valid submission. Later submitters should see `this item has already been handled` with the final handling result.

`Review / watch` items should default to list entry plus a daily summary. They should not all trigger immediate push notifications, to avoid excessive management noise.

Only severe `review / watch` items should trigger immediate push notifications, such as customer debt over 20,000 CNY, long-overdue debt, or very large after-sales compensation / allowance.

Severe-push thresholds should be configurable. Debt over 20,000 CNY can be used as an initial V1 example threshold and adjusted later based on back-office data.

Examples:

- when office staff submit a new price-table version, immediately push it to accounts with `price-table review` permission
- when a customer has 8,000 CNY debt, add it to the boss-review list and daily summary, but do not necessarily push immediately
- when a customer has 30,000 CNY debt and it is overdue, push immediately and add it to the boss-review list

`Approval` and `review / watch` items should support reminder / escalation rules by item type. Do not use one shared reminder cadence for all items.

Price-table approval:

- if the item is still unapproved 2 hours before the planned effective time, send one reminder
- if the planned effective time arrives and the item is still unapproved, the new price version must not become effective
- the system should continue using the old price and keep the price approval todo pinned / marked as `approval pending, not effective`

Performance / deduction approval:

- normal reminder cadence can be daily summary only
- if it is still unconfirmed before payroll settlement, send a strong reminder to accounts with `performance / deduction confirmation` permission

Severe debt / overdue debt review:

- this is review / watch, not approval, so it must not block flow
- default to daily summary
- if it remains unviewed for the configured number of days, remind accounts with `boss-review` permission

Reminder logs should store reminder time, recipient, trigger reason, delivery channel, and send result to avoid excessive repeated notifications.

### V1 Default Review / Approval / Reminder Thresholds

Newly created debt should not immediately enter `boss review`. V1 default rules are: debt more than 7 days past the customer's billing cycle and over 2000 CNY enters boss review; customer debt balance over 10000 CNY enters boss review regardless of whether it is newly overdue.

Ordinary customer debt creates a risk hint but does not block order save, confirmation, scheduling, or fulfillment. Only the customer risk state `management confirmation required before order acceptance` blocks direct order acceptance; office staff can save a draft / pending-confirmation order, but authorized management must confirm before acceptance.

Rounding, write-off, discount, and allowance review thresholds use amount plus percentage. If the adjustment exceeds 5% of the order / statement receivable amount, or the single adjustment exceeds 100 CNY, it enters boss review. This review does not block payment write-off or statement flow.

Free overdelivery / gift quantity uses the confirmed reasonable-overproduction thresholds. For orders below 5000 pieces, free overdelivery above 50 pieces enters boss review. For orders of 5000 pieces or more, free overdelivery above 100 pieces enters boss review. This alert does not block shipment, statements, or payment recording.

Price-version approval reminds approvers 2 hours before the planned effective time. If the item is still unapproved at the planned effective time, the new price must not become effective; the old price continues, and the price approval todo is pinned.

Ordinary inventory adjustments can be confirmed by an account with inventory-adjustment confirmation permission. If a single inventory item variance exceeds 500 pieces, or estimated value exceeds 300 CNY, it enters boss review without blocking the adjustment from taking effect.

Serious production exceptions enter boss review by default when they affect same-day shipment / pickup, involve customer compensation / allowance, repeat twice or more for the same machine or same employee in one day, or have estimated loss over 300 CNY. Ordinary production exceptions stay with office / production management.

Ordinary todos use this default cadence: red-dot reminder after 30 minutes, pin if the item ships or is picked up today, and move to follow-up after 1 day unresolved. Severe items enter boss review according to the rules above.

### Office Shared Todos And Workbench

Daily office todos should enter the `office shared todo pool` by default in V1. They should not be assigned to one named person by default.

Default visible roles are office clerks, owner-mother / management mobile accounts, and production management / supervisor. The main operators remain the office clerks.

Whoever opens the item and submits a handling result becomes the actual handler in the system record. The record should retain handler, handled time, result, and notes.

The office workbench should prioritize items that block business flow. Recommended default order: `ships / pickup due today`, `quantity difference pending handling`, `waiting label print`, `waiting customer goods-ready / carrier-arrangement notification`, `inventory shortage pending confirmation`, `production exception`, `after-sales / complaint`, and `price approval`.

P0 shared todos should initially include eight types: `order draft pending confirmation`, `shortage pending handling`, `quantity difference pending handling`, `label waiting print`, `express / less-than-truckload pickup confirmation`, `statement waiting generation`, `payment variance pending confirmation`, and `boss / management watch`.

P0 shared-todo sorting should put rush orders and items shipping / picking up today first, then red exception items, then latest required time and waiting duration.

Ordering may use urgency, latest needed time, customer risk, amount impact, and waiting duration. V1 can start with rule-based ordering rather than complex intelligent ranking.

The desktop office shared-todo workbench should use a `left todo list + right detail panel` layout. The left side groups or filters by todo type; the right side shows the selected item's order lines, customer notes, office notes, related photos / documents, handling history, and currently available actions.

The P0 right detail panel should show at least customer, order tail number, source, summary, key quantities, amount impact, customer notes / office notes, and recommended current actions. Full order details open through a linked order detail view rather than being packed into the todo panel.

Each todo list item should stay compact and show only type, customer name, order tail number, goods / spec shorthand, waiting duration / latest needed time, and required marks such as urgent, exception, or approval. Full details belong in the detail panel.

Todo actions should be type-specific rather than one generic button set. For example, `waiting label print` shows `print` / `snooze`; `quantity difference` shows `handle difference` / `contact customer` / `snooze`; `waiting customer notification` shows `copy message` / `customer notified` / `snooze`.

V1 should not implement task claiming for office todos. Todos remain in the shared pool; the system only records the account that actually handled the item and the latest handling time.

Batch operations should be limited to low-risk actions such as batch snooze, batch print preview, batch mark-as-viewed, and batch label printing. Quantity differences, payment confirmation, price approval, and other amount / inventory / fulfillment / customer-commitment actions should not support batch confirmation.

Completed todos should move into a `handled` view. It defaults to `handled today` and can filter the latest 7 days for office handoff and quick traceability.

P0 todo reminders should only use workbench red dots, count badges, and list pinning. They should not use sound alerts, SMS, Enterprise WeChat pushes, or other external notifications. Ordinary todos should not push to the boss by default.

Items entering `boss review / management watch` should be limited to cases such as price approval, large allowance / discount, overdue debt, serious production exceptions, repeated complaints, out-of-range free overdelivery, or replenishment suggestions with overstock risk.

`Boss review / management watch` remains a non-blocking review by default, not approval. Unless the item itself is an `approval`, it should not block orders, production, fulfillment, statements, or payment recording.

For manual order entry, if office staff enter a complete order and no mandatory review condition is triggered, the UI should support `save and confirm`, moving directly into formal order / accepted order or the relevant fulfillment-pending state. It should not require the clerk to find the same order again in a review pool.

Order drafts created by customer-group recognition, OCR, robot / conversation-archive recognition, or other automation should default to `order draft pending review` and require an office clerk or order-review-permitted account to confirm before becoming formal orders.

Todos should support `remind later / snooze` for cases such as waiting for a customer reply, waiting for inventory confirmation, waiting for price approval, printing labels near end of day, or waiting for production progress.

Suggested quick snooze options are `30 minutes`, `2 hours`, `tomorrow morning`, and `custom time`.

Snooze records should retain operator, set time, next reminder time, and reason / notes. When due, the item re-enters the matching shared todo queue and is re-sorted by urgency.

V1 Enterprise WeChat notifications should prioritize `Enterprise WeChat self-built application` app messages to specific internal employees. Do not prioritize customer groups or group robots for approval / risk items.

Enterprise WeChat app messages are for internal items such as price-table approval, performance / deduction approval, severe debt / overdue debt, and severe after-sales compensation review.

The system should maintain a binding between ERP accounts and Enterprise WeChat `userid`. Accounts that are not bound to Enterprise WeChat should still receive in-system notifications.

The backend should store Enterprise WeChat app configuration such as `CorpID`, `AgentID`, and app `Secret`, obtain `access_token` through the Enterprise WeChat API, and then send app messages.

Push messages should include a short title, key customer / amount / item context, and a handling link that opens the matching ERP review or approval page.

The system should log push time, recipient, Enterprise WeChat API result, and failure reason. Push failure must not lose the work item; the in-system task remains the source of truth.

Enterprise WeChat group robots can be optional V1 internal summary tools, such as daily review/watch summaries. They should not be used for items requiring a named approver.

V1 should not implement SMS notifications and should not automatically send order, debt, or after-sales reminders to customer groups by default.

## Order Numbering

One customer order should create one `original order number`, for example `DD20260626-001`.

One pasted customer message corresponds to one `original order` by default. If it contains multiple styles, sizes, colors, handle types, print / non-print items, print contents, finished-goods styles, or fulfillment methods, the system should split those into multiple `order lines / sub-orders` under the same original order.

Each split style, size, color, handle type, print content, finished-goods style, or fulfillment method should create an `order line number`, for example `ORD-0628-001-01`, `ORD-0628-001-02`, and `ORD-0628-001-03`.

Production scheduling, inventory reservation/outbound, workshop reporting, packing, delivery, and statement details should primarily link to the `order line number`.

The `original order number` groups multiple lines from the same customer order for customer recognition and internal traceability.

Order status should flow independently by `order line number`; different styles / print contents should not block each other.

For example, `ORD-0628-001-01` can be `silk-screen in progress`, `ORD-0628-001-02` can be `waiting for outbound`, and `ORD-0628-001-03` can be `pending replenishment confirmation`.

The `original order number` status should be automatically rolled up from its lines, such as partially in production, partially delivered, partially abnormal, or fully completed.

If any line has risk such as abnormal pause, quantity variance, material shortage, or missing price, the original order should show a rolled-up risk indicator, but other normal lines should continue flowing.

Customer statements, outbound, delivery, pickup, and express / less-than-truckload fulfillment can retain the same original order number, but quantity, amount, fulfillment, and exception tracing should split by order line. The statement summary should show one row per order line and include total delivered quantity and amount totals.

## Order State Machine

The original order state should be a roll-up only. It should not directly drive workshop production, inventory, packing, fulfillment, or reconciliation.

Original-order roll-up states can include partially in production, partially shipped/delivered, partially abnormal, and fully completed.

The order line is the main V1 state object. Each order line flows independently through states such as pending confirmation, pending scheduling, in production, waiting for packing, waiting for outbound, delivered, and exception.

Business state and exception state should be separated. For example, an order line can have business state `bag-making in progress` while also carrying exception tags such as `quantity variance pending handling`, `production exception`, or `finished-goods photo missing`.

Exception tags should not overwrite or scramble the main business state. Layered tags make both production progress and pending handling easier to track.

One order line can have multiple parallel todo items. For example, the same line can be waiting for customer notification and waiting for label printing at the same time, with each todo using its own handling pool and history.

Delivered order lines should not be directly rolled back. After delivery, corrections should be recorded through after-sales, adjustments, supplemental shipment, void-and-reprint records, payment variance handling, or similar additive records.

Key state changes must keep logs: before state, after state, trigger source, operator / system actor, time, and reason.

System auto-transitions should happen only from explicit actions such as workshop completion, packing completion, print confirmation, pickup confirmation, or payment confirmation.

Cases involving customer communication, amount handling, inventory exception, quantity variance, stock shortage judgment, or after-sales responsibility should enter a human todo pool rather than being automatically decided.

V1 needs cancel / close states with distinct reasons. Suggested reasons include customer cancellation, cancelled because stock is unavailable, duplicate order voided, recognition error voided, and management rejection. Different cancellation reasons affect inventory release, customer statistics, responsibility tracing, and later analysis, so they should not be collapsed into one vague `cancelled` state.

### V1 State Dictionaries

Original orders are roll-up objects only and do not directly drive workshop, inventory, packing, fulfillment, or reconciliation. V1 original-order roll-up states are `pending confirmation`, `in progress`, `partially completed`, `fully completed`, `cancelled`, and `exception handling`.

Order lines are the primary state objects. V1 order-line main states are `draft`, `pending confirmation`, `pending scheduling`, `scheduled`, `silk-screen in progress`, `waiting bag-making`, `bag-making in progress`, `waiting packing`, `waiting outbound`, `fulfillment pending confirmation`, `waiting fulfillment`, `delivered`, and `closed`.

Different order types skip irrelevant states instead of maintaining separate state systems. For example, non-print stock goods can move from `pending confirmation` directly to `waiting outbound`; external-processing print orders can skip bag-making and finished-goods inventory states.

Exception states are additive tags and do not overwrite the main state. V1 exception tags are `information missing`, `insufficient inventory`, `quantity variance`, `production exception`, `photo retake required`, `waiting customer confirmation`, `after-sales in progress`, and `responsibility pending confirmation`.

Example: an order line can display `bag-making in progress + quantity variance` instead of being collapsed into a vague `exception`.

V1 production task states are `draft`, `published`, `waiting start`, `in progress`, `paused for confirmation`, `completed`, `skipped`, and `voided`.

V1 packing task states are `waiting packing`, `packages submitted`, and `packing exception`.

V1 package states are `waiting label print`, `printed`, `waiting pickup / waiting fulfillment`, `delivered`, `label exception`, and `voided`.

V1 fulfillment states are `waiting fulfillment`, `waiting self-pickup`, `waiting driver delivery`, `in delivery`, `waiting express / less-than-truckload pickup`, `partially delivered`, `delivered`, and `fulfillment exception`.

V1 statement states are `not generated`, `generated`, `sent`, `customer confirmed`, `partially paid`, `paid`, and `disputed`.

V1 payment states are `pending confirmation`, `written off`, `variance pending confirmation`, `overpayment pending handling`, and `voided`.

V1 after-sales states are `pending handling`, `in progress`, `resolved`, and `closed`.

V1 responsibility states are `clue recorded`, `pending verification`, `responsibility confirmed`, `no responsibility`, and `performance handling completed`.

Customer-facing after-sales handling and internal responsibility / deduction confirmation are separate. Customer issues can be resolved first, while responsibility and performance handling are confirmed later without blocking the order's main flow.

## Defer For Later

- Fully automatic optimal scheduling
- Complete platform e-commerce integrations beyond the self-run shop API
- Complex express tracking
- Full cost accounting including labor, electricity, depreciation
- Full WMS wave picking
- Full quality inspection module
- Native mobile apps, unless the mobile web/PWA approach proves insufficient

## Key Domain Objects

- Customer
- Product / SKU
- Bag size/model
- Print content / print plate
- Bag price table
- Print step price table
- Order
- Order line
- Channel/source
- Fulfillment method
- Warehouse
- Inventory item
- Roll material
- Leftover roll/material record
- Workshop
- Machine
- Machine capability
- Production work order
- Silk-screen task
- Bag-making task
- Packing record
- Package line
- Shipping display name
- Delivery note
- Pickup outbound note
- Driver delivery photo
- Customer statement
- Payment record
- Price snapshot
- Manual price override record

## Order Source And Fulfillment

Order source:

- offline local customer
- self-run online shop
- peer/factory processing

Fulfillment method:

- delivery
- customer pickup
- express / less-than-truckload

Do not collapse these into a single online/offline field.

Order / order-line records should support a `shipping display name`, used for express / less-than-truckload labels, locating goods, statement display, and internal recognition. It can be extracted from the product name / print-content naming, such as `Midea air conditioner` from `Midea air conditioner 30*38 red bag yellow print same both sides 1000 pcs`. It does not participate in price calculation. If the customer does not provide a clear display name, office staff can fill it manually during order entry. For `express / less-than-truckload + custom printed orders`, shipping display name is required before printing package labels or moving goods into the waiting pickup area; it should not block initial order saving or production scheduling. For self-pickup, driver delivery, and ordinary stock/common-goods orders, this field is optional.

## Model / Size Normalization

For the current business, customer-spoken model and size can be treated as the same concept.

Rules:

- `30*38`, `30*38*10`, `30*37`, and `30*37*10` are the same common model/spec group.
- The actual production, inventory, and costing standard for this group is `30*37*10`, meaning width 30cm x height 37cm x bottom/side gusset 10cm.
- When the customer, price table, or historical document says `30*38` / `30*38*10`, the UI can preserve that customer-facing wording, but internal normalized spec, inventory matching, scheduling, material usage, and costing should use `30*37*10`.
- The business currently does not handle no-gusset bags.
- Paste-to-parse order entry and inventory matching should normalize customer shorthand specs into the full internal size representation.
- Horizontal bag wording varies by customer. Some customers say full specs such as `横款袋子 40*30*10cm`; others only say shorthand like `40*30`.
- Some customers use size names such as small, medium, large, and extra large instead of numeric dimensions.
- The system should maintain a size/spec alias table that maps customer wording, shorthand, and size labels into normalized internal specs.
- V1 can start with global aliases; later versions should support customer-specific aliases because `small/medium/large` may mean different specs for different customers.
- If parsing is ambiguous, the system should show candidate specs and confidence for office confirmation instead of silently guessing.
- Current internal size class mapping can start with:
  - vertical from small to large: `25*32`, `30*38 / 30*37`, `35*41`
  - horizontal from small to extra large: `35*27`, `40*30 / 40*32`, `45*37`, `50*40`
  - horizontal `40*30` and `40*32` both belong to the horizontal medium class
- Size classes help parse customer wording and guide scheduling. Inventory, pricing, and production should still keep the exact normalized size to avoid mixing dimensions that are not actually interchangeable.

## Smart Order Entry

Order entry should include a paste-to-parse dialog similar to express address/phone recognition.

Office staff should be able to paste customer text into one dialog. The system should parse structured fields such as size, color, quantity, print requirement, and print content, then show the result for manual review and correction.

V1 manual order entry should not primarily rely on filling many dropdowns one by one. The manual order-entry screen should also provide a blank natural-language input area at the top. Office staff can type a full phone, on-site, private-chat, or verbally summarized order into that box; the system parses it and renders editable structured order lines below.

Manual order entry and pasted recognition should share the same parse-and-review experience: source input / paste / upload area on top, then editable order lines, inventory, price, and risk results below. Office staff mainly correct parsed results; only missing or low-confidence fields require manual field-by-field completion.

Manual order entry still needs fallback controls such as adding a line directly, manually splitting / merging lines, and manually selecting customer, size, color, fulfillment method, and related fields. These controls are fallback, not the daily primary entry path.

The P0 recognition entry should use a large top input area with only three primary actions beside it: `recognize`, `clear`, and `fill sample`. This keeps office staff focused on pasting customer messages instead of filling many fields first.

When one P0 input text contains multiple sizes, colors, print contents, or fulfillment methods, recognition should automatically split the result into multiple editable order lines. Office staff can still merge, split, or delete rows manually.

The P0 parsed-result table should directly show customer, product / print content, size, color, handle type, style / type, print flag, quantity, fulfillment method, latest needed time, inventory status, and estimated amount. Custom printed lines should show the visible style / type as `定制印刷` instead of looking like ordinary `空白袋` rows; `空白袋` remains the base bag / inventory style in detail data.

Complex fields should live in the right-side detail panel in P0: business type, base bag style, compact color spec, print image / artwork, print side, print color, handle color, notes, customer notes, office notes, price snapshot, and source / recognition evidence. Recognition should split customer shorthand such as `白印黑`, `黄印黑`, `白袋黑提`, `黄袋红提`, `white bag printed black`, and `black handles` into structured bag color, print color, handle color, print side, and notes where possible.

P0 missing-field blocking should depend on order type. Stock/common-goods orders only require customer or source customer, size / model, color, and quantity. Custom printed orders require production-critical print content, print image / artwork, print color, print side, and similar fields.

P0 confidence display should use normal styling for high confidence, yellow hints for medium confidence, and red required confirmation / correction for low confidence before formal-order creation.

The P0 order-entry / recognition footer actions are `save draft`, `save and confirm`, `split order`, and `void draft`. A complete manual entry without mandatory review conditions can use `save and confirm` directly and should not enter the shared todo pool for duplicate review; automation / OCR / robot drafts still default to review.

The order-entry page should keep two business entry modes: `manual order entry` and `paste recognition`. The difference is mainly source context: manual entry may come from phone, on-site orders, private chat, or office-staff summarized text; paste recognition usually comes from customer group messages, customer original text, screenshots, or files. Both modes should flow into the same draft review / formal-order creation path.

Many customer orders currently arrive in Enterprise WeChat group chats. The parser should prioritize natural-language order text copied from those group chats.

Customer name, fulfillment method, and latest delivery time may or may not appear in the pasted text. If present, the parser should extract them. Missing fields should be judged by order type instead of always blocking because fulfillment method or latest delivery time is missing.

For stock/common-goods orders, customers may only mention size, color, and quantity. Some customers will say when they need the goods or whether they will pick up or need delivery; others will not.

For stock/common-goods orders, a clear customer / customer group, size/model, color, and quantity are enough to form a valid draft / order. If extended handle is not mentioned, default to normal handle; if style keywords such as 小熊, 喜, 福, or 覆膜 do not appear, default to plain/blank bags.

For stock/common-goods orders, missing fulfillment method or latest needed time is a non-blocking pending field, not a direct reason to route to missing information.

When stock is available, the system should show available inventory and estimated ship-ready / pickup-ready time, and can generate editable customer copy such as "in stock, expected to be ready this afternoon". Fulfillment method can be confirmed later before outbound, delivery, or pickup.

For custom printed orders, key missing fields should be based on whether production can proceed: size/model, color, quantity, print requirement, print content, print color, print position, print image, or print artwork/file.

If a custom printed order lacks a print image, artwork/file, or key print requirement, it should enter missing information and generate customer copy asking for the missing image/artwork/print details.

If a custom printed order lacks latest shipment time, mark it as a scheduling risk / pending confirmation and show estimated lead time or a suggested confirmation time. If production-critical information is complete, office staff can decide whether to accept and schedule first.

The business can gradually improve customer ordering habits in Enterprise WeChat groups by encouraging a more consistent order message format.

If one pasted message contains multiple different styles, colors, or print contents, the system should split them into separate order lines / sub-orders under the same original order.

Examples:

- `30*38 红500个` should be parsed as 500 red stock/common bags in size 30*38.
- `30*38 红500个、黑100个` should be split into two order lines under the same original order.
- If one customer asks for 30x38x10 white bags with print A, 30x38x10 white bags with print B, and 25x32x10 red non-printed bags, those should become three order lines / sub-orders under the same original order.

Recognition drafts must preserve the original source content, including original text, images / files / OCR results, source customer, source customer group, sender, sent time, and source message ID.

The purpose of preserving original source content is dispute and traceability: if the customer or the factory later questions what was ordered, the original wording remains available.

The order-draft review page should use a side-by-side layout:

- left side: original customer message, images, files, source customer / customer group, sender, and timestamp
- right side: parsed ERP result, with order-line rows showing size, color, handle type, finished-goods style, quantity, print flag, print content / shipping display name, print color, fulfillment method, latest needed time, inventory state, price result, and risk hints

Parsed fields should carry confidence levels: `high`, `medium`, and `low`.

`Low confidence` fields must be manually edited or confirmed before a formal order can be created.

`Medium confidence` fields should be highlighted for office review.

If the draft has high confidence and no missing-field, inventory, price, or customer-risk issue, the review page may allow one-click creation of the formal order, while still recording reviewer and review time.

Suspected duplicate messages must not be automatically voided.

Duplicate hints can use signals such as same customer / same customer group, short time window, and highly similar size / color / quantity / print content.

After a `suspected duplicate` hint, office staff decides whether the message is a repeated reminder, supplemental explanation, order modification, or true duplicate order.

When the customer later sends modification text such as `change to red`, `quantity to 1000`, or `switch to pickup`, the system should create a modification record.

The modification record should compare changed fields against the original draft / order. Office staff confirms whether to update the draft, update the order, create a new line, or close an old line.

Modifications must not silently overwrite production-critical fields. They must record before/after values, source message, confirmer, confirmation time, and reason.

Recommended draft states are `pending review`, `missing information`, `formal order created`, `voided due to recognition error`, and `suspected duplicate pending handling`.

The draft review / order-entry actions should include `create formal order`, `save draft`, `save as missing information`, `void because recognition is wrong`, `re-run recognition`, and `manually split / merge order lines`.

The risk area should consistently show stock shortage, price exception / manual price override, customer debt / risk, missing print image, unclear delivery deadline, and suspected duplicate order.

Manual corrections should be saved as future recognition hints.

Example: if a customer often says `large red 500` and office staff repeatedly confirms that it means `45*37 red 500`, the system can prioritize that hint for the same customer later.

In V1, learned hints are suggestions only. They must not become automatically effective for new aliases, low-confidence mappings, or ambiguous one-word-to-many-size/color situations.

Before creating a formal order, the system must re-check inventory and price.

Inventory and price on the draft are recognition-time snapshots only. They are not formal inventory reservations or formal order prices.

If current inventory or price differs from the draft snapshot during review, the UI should clearly show the difference, such as `recognized-time available 500, current available 0` or `recognized-time unit price 0.36, current price version 0.39`.

Only after office staff confirms formal order creation should the system save the formal price snapshot, reserve inventory, and record the source draft and generated order number.

## Scheduling Requirements

The system must handle many small fragmented orders. It should favor:

- short machine queues
- batch suggestions
- quick rush-order insertion
- manual queue adjustment
- changeover/mold-change visibility
- same-day and next-day risk warnings

The production board must show:

- machine queues
- sequence
- estimated duration
- current machine status
- selected job detail
- bottleneck status
- material/leftover hints
- available operations

The large TV board should keep the first screen scannable. It should show machine, current job, next job, customer / shipping display name, size, color, handle type, planned quantity, completed quantity, remaining quantity, estimated completion time, and exception flags. Full customer notes, office notes, price, internal cost, and other dense detail should be opened from the backend detail page, not shown on the TV board.

When office staff inserts a rush job or changes sequence, V1 should directly update the published bag-making machine queue, auto-refresh the workshop side and large TV board, and highlight `rush insertion / sequence changed`. It should not require workshop staff to click a forced confirmation, but it must record operator, time, before/after sequence, and reason.

The large TV board should only show information needed for quick shop-floor scanning. It should not show full customer notes, office internal notes, prices, costs, margin, statement status, or payment status.

Estimated completion on the large TV board can be shown in coarse terms such as `expected morning`, `expected afternoon`, `expected tonight`, `expected tomorrow`, or as a rough time window. V1 should not force minute-level precision on the TV board because shop-floor changes can make it misleading.

Estimated completion time on the board is a reference value, not a customer promise. If it is manually changed, the system should record editor, timestamp, and reason.

Silk-screen scheduling should use a `silk-screen task pool`.

The 4 silk-screen machines are generally bound to 4 fixed silk-screen workers, one worker per machine.

Office staff should assign same-day print orders to the silk-screen workshop / task pool, not directly to machine 1-4 with a fixed production sequence.

The silk-screen workshop decides actual order and machine arrangement based on plate, print color, material availability, setup state, and delivery urgency.

At the start of the workday, silk-screen workers can mark / claim orders from the `silk-screen task pool` that they plan to print.

An order marked by one silk-screen worker becomes locked, so the other silk-screen workers cannot mark it again.

Marking / claiming does not mean printing has started; it only means the worker is preparing to handle that order.

A marked order can be cancelled by the worker who marked it, cancelled from the office backend, or assigned by office / supervisor to a specific silk-screen worker.

When a silk-screen worker clicks `start printing`, the order enters `silk-screen in progress`, and the system records actual operator, actual silk-screen machine, and start time.

Because silk-screen machines and workers are generally fixed, actual silk-screen machine defaults from the current logged-in worker's bound machine.

For example, if worker A claims print work order 2 from the task pool and clicks `start printing`, the system records worker A, A's bound machine number, and start time automatically.

After printing starts, the actual silk-screen worker uploads the `print photo`; the system automatically links order line number, machine number, operator, and photo time.

When printing is completed, the actual silk-screen worker submits actual printed quantity and finish time.

The print photo must be uploaded after `start printing` and before clicking `printing completed`.

Without a print photo, the silk-screen worker cannot submit `printing completed`.

In rare exceptions, office staff or the production supervisor can override / release the block from the backend, but the system must record release reason, releaser, and release time.

If the print photo is wrong, unclear, linked to the wrong order, or does not show the print result clearly enough, office staff / production management can return it for retake.

When a print photo is returned, the system should preserve old photo, new photo, returner, return time, and return reason.

If a print photo has been returned and no replacement accepted photo has been uploaded, the worker should not be able to submit `printing completed` by default.

In special cases, office staff / the supervisor may override this, but must enter an override reason and keep the audit record.

Silk-screen exception reporting should split into `report exception and continue` and `report exception and pause for confirmation`.

Minor issues can continue, while whole-order errors, mismatched print content, obviously wrong print color, or severe position offset should pause and wait for supervisor / office confirmation.

V1 fixed silk-screen exception reasons should include wrong print color, position offset, missing print / ghosting, dirty screen, print pattern / content mismatch, material issue, quantity exception, and other.

Silk-screen exception records should link to order line, silk-screen task, machine, operator, photos, quantity, and handling result.

The task pool can show suggested sequencing by latest delivery time, grouping similar colors, and rush priority, but V1 should not force the workshop to follow the suggested order.

The V1 silk-screen task pool should mainly show same-day tasks, with a separate `tomorrow preview`.

`Tomorrow preview` is for checking upcoming orders, finding plates/screens, preparing ink, or arranging shop-floor work. It does not mean the silk-screen workshop is required to print those tasks early.

If a silk-screen worker marks / claims a task but does not click `start printing` for a long time, the system should not automatically release the task.

The marked task can be cancelled by the worker, or cancelled / reassigned / assigned to a specific worker by office staff or the supervisor.

If a marked task remains unstarted beyond a configured time, the system should only remind the worker, office staff, or production management. It should not automatically take the task back.

After silk-screen setup is adjusted, at least one print photo is required.

If the job is double-sided, has different front/back content, uses multiple colors, or needs extra confirmation, multiple photos should be allowed.

Print photos support customer confirmation, later bag-making checks, exception tracing, and responsibility investigation. V1 should not require many fixed photo angles for every job, to avoid excessive workshop burden.

Actual printed quantity is still reported by the actual silk-screen worker.

After the worker submits actual printed quantity, the task can flow to later bag-making or fulfillment. Quantity exceptions enter quantity-difference / production-exception handling, but should not block later bag-making by default.

Actual printed quantity is important source data for later analysis of overprinting, bag-making loss, and final qualified quantity variance.

Plates / screens are generally one-time consumables.

V1 should not manage plate / screen inventory, reuse reminders, or mandatory plate numbers.

If needed, the order or silk-screen task can optionally record whether a new plate/screen was made, plate/screen notes, or related exceptions, but this should not become an independent inventory module.

V1 should not deduct ink inventory.

Silk-screen tasks record print color and necessary notes only. Ink cost, ink inventory, and ink usage can be added later.

External-processing print orders / peer-processing print orders should be a separate task type and should not be mixed into the factory's custom bag-making order flow.

These orders only cover printing. They do not enter bag-making, stock replenishment, or finished-goods inbound inventory.

External-processing print tasks can appear in the silk-screen workshop UI as a separate category or filter, so they are not confused with orders that need later bag-making.

Recommended V1 states for external-processing print orders: `waiting for printing -> silk-screen in progress -> printing completed -> waiting for delivery / return / pickup -> completed`.

External-processing print orders should record customer / processing party, supplied or to-be-printed quantity, print content, print color, print photo, actual printed quantity, handover person, handover time, and fulfillment method.

After completion, an external-processing print order creates printing-service fulfillment and statement records only. It must not create bag-making tasks or finished-goods inventory for this factory.

The current common external-processing print flow is one print layout and several material rolls brought by the customer / processing party.

V1 should not manage leftover material for external-processing print jobs. It should not require remaining roll, remaining meters, or leftover return records.

External-processing print jobs should be counted by actual printed quantity: print as much as the supplied material can produce, and use actual printed quantity and delivered quantity as the main result.

If the business wants to record supplied material, V1 should only store lightweight supplied-material notes or roll-count notes. It should not enter raw-material inventory.

External-processing print pricing should use a separate `external-processing print price table`. It should not reuse bag price tables or the factory's own silk-screen step price tables.

External-processing print-service pricing in V1 should use `print unit price x actual printed quantity`, with per-order manual price override allowed and price snapshot preserved.

External-processing print orders should retain fields such as single-sided / double-sided, print color, and color count for statistics and reconciliation. In V1, price still defaults to office-selected or manually entered unit price instead of a complex automatic formula.

External-processing supplied-material info in V1 should record only customer / processing party, supplied roll count, material color / spec notes, optional supplied-material photo, and optional estimated printable quantity. These records do not enter formal raw-material inventory and do not participate in this factory's material-cost allocation.

External-processing print statement fields should include customer, print content / item name, print color, actual printed quantity, print unit price, amount, delivery date, and notes.

If external-processing print quality issues occur, route them to after-sales / complaint handling and link the silk-screen task, operator, photos, quantity, and amount adjustment.

V1 fixed outcomes for external-processing quality issues should include customer accepts, allowance / discount, reprint, no compensation / no handling, and other. Any amount impact adjusts the original external-processing print order instead of creating a normal new sales order.

After external-processing printing is completed, the system should create a `printing-service fulfillment record`. Fulfillment methods include return delivery, self-pickup, and express / less-than-truckload. Delivery photos, pickup signatures, and express / LTL records reuse the normal fulfillment evidence model.

For small-plate and manual supplemental printing handled by another / associated factory, V1 should only support monthly summary export and should not build full accounts payable.

Suggested associated-factory small-plate / manual-print monthly export fields: date, original order, customer, supplemental print quantity, plate fee, manual print unit price, amount, associated factory, and notes.

Bag-making scheduling should assign work to a concrete bag-making machine, date, and sequence. After formal dispatch, only the bag-making worker assigned to that machine in the current schedule / shift can see the work order on mobile.

V1 bag-making scheduling should not require minute-level start and finish times for every production task.

Ordinary bag-making tasks should be scheduled by `machine + date + sequence`. Planned time is required mainly for mold-change work orders, special rush tasks, or tasks that need technician coordination.

This keeps scheduling usable when rush insertions, material waits, machine condition, or shop-floor coordination changes the actual timing.

Before the production summary sheet is imported, initial machine capacity should be manually maintained by `machine + size/model`, with rough daily output / hourly output values.

If a machine + size/model has no specific capacity value, the system can use a same-size default or a similar-machine default, and estimated completion should be marked `low confidence / estimated`.

Scheduling should distinguish `draft schedule` from `published schedule`.

`Draft schedule` is visible and editable only to office staff / production management. It should not appear on workshop mobile or the large TV board.

Only `published schedule` appears on workshop mobile and the large TV board.

After publishing, changes to machine, date, sequence, quantity, or task content must retain audit history.

The change log should include operator, timestamp, before/after values, and reason.

Recommended scheduling priority: promised customer due date first, rush orders second, customer-locked waiting quantities third, ordinary custom orders fourth, and normal stock replenishment last.

Stock replenishment must not hurt promised customer due dates. If a replenishment task contains customer-locked quantity, the customer-locked part should be protected first.

If tasks share size, color, handle type, or handle/strap setup, the system may suggest continuous production.

Continuous-production suggestions are for office / production management reference only. They must not automatically override customer due dates or rush-order priority.

Mold changes take about 1-2 hours and should preferably happen around lunch break or after work rather than disrupting daytime production. The current on-site process is that production management calculates the mold-change time from the dispatch plan, then tells the technician to change the mold at the required time. The system should support creating a `mold-change work order` after office / production management completes dispatch, and send it to the technician page / technician task pool.

A formal `mold-change work order` should be created only when technician coordination is actually needed. Ordinary continuous production, same-model continuation, or on-site cases that do not require technician involvement should not be forced to create mold-change work orders.

A `mold-change work order` should include at least bag-making machine number, planned mold-change time, current model / size, target model / size, linked production work order / order line, estimated mold-change duration, priority, creator, created time, and notes.

Suggested `mold-change work order` states: `pending mold change -> mold change in progress -> completed`, with exception states such as `cannot change on time`, `needs confirmation`, and `cancelled / voided`.

Technicians should see today's / tomorrow's mold-change tasks on mobile or desktop, sorted by time and machine. V1 actions should stay lightweight: `start mold change`, `complete mold change`, and `cannot do on time / needs confirmation`.

V1 mold-change tasks should enter a `technician task pool` rather than being hard-assigned to a named person by default. The factory currently has only one technician, but the system structure should still use a task pool. Whoever clicks `start mold change` becomes the actual technician.

The system can detect size / model changes in the bag-making queue and show a `possible mold change needed` prompt, but a formal `mold-change work order` should be created only after office staff or production management confirms it, because on-site mold state may make automatic judgment inaccurate.

When a technician clicks `complete mold change`, the system records actual start time, finish time, technician account, machine, target model / size, and notes. Photos are optional by default and should not be required for normal mold changes unless later disputes or machine issues need evidence.

If the preceding `mold-change work order` for a bag-making task is not completed, the bag-making worker should receive a strong warning when clicking `start production`. V1 should not hard-block production start, but continuing requires selecting / entering a reason and retaining the trace.

For exception states such as `cannot do on time`, `mold-change exception`, or `machine issue`, the system should require or strongly recommend notes and optionally photos. Normal on-time mold changes should not add a photo burden.

If a planned mold change is near its scheduled time but has not started, the system should first remind the technician task pool and production management / office, not push the boss by default. Example: for a planned 12:00 mold change, if it has not started at 11:45, show a red dot on the technician page; if it still has not started at 12:00, move the production management / office todo to the top.

If office / production management inserts rush jobs, changes machines, or changes sequence so that mold-change timing changes, the system should remind staff to update the linked mold-change work order. If the old work order time must be changed, cancelled, or voided, the technician task pool should be notified and the change history retained.

Mold-change work orders are reminders and trace records, not automatic scheduling optimization. V1 still relies on office / production management to decide the mold-change time. The system can use a 1-2 hour setup buffer for scheduling risk hints, and later calibrate estimated duration from actual mold-change records.

V1 estimated completion time can be roughly calculated from `current queue sequence + quantity / default capacity + mold-change buffer + material-wait buffer + rest / end-of-day impact`, and office / production management can manually edit it. Example: if a machine defaults to 3000 pieces/day for 30*38 and the order is 1500 pieces, the system can estimate half a day; if a mold change is needed before it, add a 1-2 hour buffer.

Estimated completion time should be visibly marked as system-estimated or manually edited.

The calculation basis should be visible to office staff / production management, such as machine default capacity, order quantity, mold-change buffer, material-wait buffer, and manual adjustment notes.

When office staff / production management manually edits estimated completion time, a reason is required. Suggested fixed reasons are `rush order`, `waiting for material`, `mold change`, `machine issue`, `customer chasing`, and `other`.

If estimated completion is later than the order's latest needed time, it should enter the office / production-management todo pool. If it seriously affects same-day shipment, pickup, or an already-promised customer delivery, it should also enter management review / watch.

Cross-day unfinished bag-making tasks should automatically stay at the top of the original machine queue or in a `continue task` area.

Cross-day tasks should show yesterday's completed quantity, remaining quantity, current state, original sequence, and whether they affect today's following queue.

When continuing the next day, the task should keep the original order line and production task instead of creating a new normal order. This supports daily output statistics, machine-efficiency analysis, and responsibility traceability.

## Stock/Common-Goods Inventory Decision

Stock/common-goods orders are a major part of the business. The current mix is approximately 60% stock/common goods and 40% custom orders.

After a stock/common-goods order is entered or parsed, the system should automatically check finished-goods inventory.

For example, after parsing `30*38 red 500 pieces`, the system should check:

- whether finished goods exist for the matching size, color, handle type, and finished-goods style
- which warehouse/location has inventory
- whether available quantity is enough for the order

Stock/common-goods finished inventory should be separated at least by:

- size
- color
- handle type: normal/default or extended handle
- finished-goods style: plain/blank, 小熊, 喜, 福, 覆膜
- warehouse/location

Finished-goods inventory quantity unit is pieces. In Chinese UI, both `个` and `只` are acceptable display terms, but the internal primary unit should be normalized to `个`.

Packages, bundles, and boxes should not be primary finished-goods inventory units. They should be recorded in packing and outbound package details.

Finished-goods style must be validated against allowed sizes. The system should not combine any style with any size arbitrarily.

For example, `30*38 red blank bag` and `25*23 小熊 bag` are separate inventory items. `30*38 小熊 bag` should not be generated because 小熊 has no 30*38 size.

If inventory is enough, the order should follow the stock flow:

`已接单 -> 待出库 -> 出库 -> 装包 -> 送货/自提 -> 已完成`

For stock/common-goods lines without inventory where the customer agrees to wait, the line should follow:

`waiting for customer decision to wait -> waiting for replenishment / production -> scheduled -> production completed -> waiting for outbound -> completed`

For stock/common-goods orders, if the pasted parsing result is clear, inventory is sufficient and trustworthy, and pricing is complete, the system can automatically move the matching order line to `waiting for outbound`. If fulfillment method / latest needed time is missing but the stock-core fields are clear, move it to `fulfillment pending confirmation`, not `missing information`.

Recommended conditions for automatic `waiting for outbound` / `fulfillment pending confirmation`:

- size/model, color, quantity, handle type, and finished-goods style are parsed clearly without ambiguity
- if fulfillment method is explicit or can be determined from the customer profile default, the line can enter `waiting for outbound`; if it is not clear yet, the line can only enter `fulfillment pending confirmation` and must not generate a concrete outbound / delivery task
- finished-goods inventory is enough, mainly from counted warehouse inventory or other trusted inventory
- bag price, print price / non-print determination, and other fee rules are complete enough to create the order amount snapshot
- the customer has no strong risk requiring manual handling; normal non-blocking risk hints do not stop automatic waiting-for-outbound

The order line should stay in `pending confirmation` before outbound when:

- pasted parsing is ambiguous, such as `medium red bag 500 pieces` where the system cannot choose between `40*30` and `40*32`
- a custom, scheduled-production, or rush order lacks fields that affect scheduling or production judgment, such as latest shipment time, print image, artwork/file, or key print requirements
- inventory is numerically enough but mainly comes from `workshop-reported / loose / unreviewed` inventory
- price is missing, price calculation fails, no price table version matches, or this line needs manual price override
- the customer has a strong risk hint, management confirmation required before order acceptance, abnormal notes, or other human-judgment risk

Stock inventory matching must use exact inventory keys. Size/model, factory standard color, handle type, and finished-goods style must all match before the system can treat the item as `in stock`.

Color aliases only map different wordings to the same factory standard color; they do not permit similar-color substitution. Size aliases/classes only help parse customer wording; they do not permit similar-size substitution.

V1 may show `possibly similar inventory` as a reference, such as when the customer asks for `red` but only similar colors like deep red / wine red / rose red are available, or when a nearby size exists. These hints are only for office reference. They must not count as available inventory, reserve inventory, move the line to `waiting for outbound`, or generate customer copy that says the requested item is in stock.

Because most customers order after receiving e-commerce orders from their own buyers, color and size usually cannot be changed. Similar-substitution hints may not be useful in many cases. Only after office staff and the customer explicitly confirm `change color / change size / change style` should the system close the original line and create a new line that reruns inventory lookup.

V1 should not distinguish color differences between batches under the same factory standard color. If factory standard color, size/model, handle type, and finished-goods style match, the inventory can be treated as the same available stock item.

Raw-material batches, finished-goods inbound batches, and inbound time should still be retained for traceability, FIFO reference, stocktaking, and exception investigation, but they should not participate in color-substitution decisions and should not require a customer order to be shipped from one same-color batch.

Inventory shown during customer-group automatic recognition is only an inventory snapshot, not a reservation.

Order drafts do not reserve inventory. The draft should store the recognition-time inventory snapshot, including available quantity, inventory source, location, query time, and whether the source is trusted.

When office staff reviews the draft and creates a formal order, the system must re-check inventory. If inventory is still sufficient, the formal order immediately reserves / locks the inventory.

Even if the formal stock order is still in `fulfillment pending confirmation`, it should reserve inventory once the customer intent is clear and inventory is sufficient, so another order does not take the goods while fulfillment method or needed time is being confirmed.

If `fulfillment pending confirmation` exceeds a configured time without fulfillment method or needed time confirmation, the system should not automatically release the reservation. It should enter a reminder list where office staff decides to keep holding, cancel the order, change quantity, or contact the customer.

Initial reminder timing for `fulfillment pending confirmation` should be tested by urgency:

- if the customer text indicates urgent / today / immediately / this afternoon, remind office staff after 10 minutes without handling
- normal stock/common-goods orders: remind after 30 minutes
- old customers, non-urgent orders, or orders only missing pickup / delivery / express method: remind after 2 hours
- near the end of the workday, unresolved items enter an end-of-day pending list

`Fulfillment pending confirmation` should not be assigned to a single person. It enters a shared task pool.

The shared pool should be visible to the two office clerks, the owner mother's / management mobile account, and production management / supervisor. The primary operators remain the two office clerks.

The task pool can show last operator, latest reminder time, and current state, but does not require a named owner. Whoever confirms, cancels, changes quantity, keeps holding, or contacts the customer is recorded as the actual operator for that action.

During manual order entry, if fulfillment method, needed time, inventory, and price are already confirmed on the entry page, office staff should be able to directly confirm fulfillment and save the order into `waiting for outbound`. The order should not be forced into the shared pending pool and then require a second lookup/click.

If fulfillment method or needed time is still unclear during manual entry, then the order enters the shared `fulfillment pending confirmation` pool.

Manual stock/common-goods order entry should offer two save actions:

- `save and wait for outbound`: use when fulfillment method / needed time, inventory, and price are already clear. The system re-checks inventory, reserves inventory, creates the formal order, and moves it directly to `waiting for outbound`; it records entry operator, action time, and reservation result.
- `save to fulfillment pending confirmation`: use when fulfillment method or needed time is still unclear. The system creates the formal order, reserves inventory, and moves it into the shared `fulfillment pending confirmation` pool without creating a concrete outbound / delivery task.

`Save and wait for outbound` should not automatically print an outbound note. It only creates the `waiting for outbound` task and inventory reservation.

Outbound note, delivery note, and pickup note printing should be controlled by account permissions. An account with print permission manually clicks `print outbound note`, `print delivery note`, or `print pickup note` from the outbound task.

V1 defaults to office staff as the only users with document printing permission. Outbound workers, drivers, and workshop accounts are not default printers.

First print, voiding old notes, and reprinting new notes all use account permissions. Reprints should choose a reason such as customer quantity change, damaged paper, lost document, information change, or other.

When outbound workers find a quantity mismatch, document issue, or last-minute customer change, they may go to the office or call the office to explain the situation. In the system, voiding the old note, generating the revised note, and reprinting the new paper note can only be done by office staff or another account with document-printing permission.

Printing should record printer, print time, print count, electronic note number, paper note number, and reprint reason when applicable. Reprints should retain history.

If inventory changed between recognition and office review, the review screen should clearly show the difference, for example `recognized-time available 500, current available 0`. The office must not continue promising in-stock fulfillment; the line should move to the shortage confirmation / customer decision flow.

Before outbound, the system should perform a final inventory check. If reserved inventory and physical stock do not match, route to quantity mismatch / unable to outbound exception handling.

Examples:

- `30*38 red 500 pieces, customer pickup`: warehouse-counted inventory has 2,000 pieces and price can be calculated, so the line automatically becomes `waiting for outbound`
- `medium red bag 500 pieces`: if the system cannot choose between `40*30` and `40*32`, keep it `pending confirmation`
- inventory is enough but mostly from newly reported `workshop-reported / loose / unreviewed` stock: keep it `pending confirmation` and show an unreviewed-inventory warning

If inventory is not enough, the system should show the shortage and wait for office / customer confirmation. It should not automatically generate a production work order by default.

Stock/common-goods orders should check inventory per order line. When one customer places many small stock/common-goods lines at once, lines with inventory can enter `waiting for outbound`, while lines without inventory should enter `waiting for customer decision to wait` or `pending replenishment confirmation`.

Printed custom orders should not use this stock-waiting logic because they are made to order and do not depend on whether finished-goods stock is available.

When stock/common-goods inventory is insufficient, V1 should support `ship available lines first + ask whether the customer will wait for unavailable lines`, but this must require office confirmation by default. The system should not automatically split the order.

The insufficient-inventory prompt should show required order quantity, currently available inventory quantity, shortage quantity, and inventory source / confidence.

Office confirmation options should include:

- `move all to production`: do not ship current inventory first; wait until the required quantity is produced / available before outbound
- `ship inventory + produce shortage`: create an outbound task for available inventory and a production / replenishment task for the shortage
- `change accepted quantity`: the customer accepts only the current inventory quantity or another negotiated quantity

For multiple stock/common-goods lines in one customer order, customer waiting should be confirmed per order line:

- lines with inventory: enter `waiting for outbound`
- lines without inventory and customer is willing to wait: create a shortage production / replenishment task linked to the original order line, and prioritize the finished goods for that customer when complete
- lines without inventory and customer is not willing to wait: cancel / close that line without production; other available lines continue outbound

For unavailable lines, the system should generate copyable WeChat / Enterprise WeChat message text. Office staff copy it into the customer group or private chat, then choose a handling result based on the customer reply.

The copyable message should include unavailable lines, lines that can ship first, predicted production lead time or estimated ship-ready date, and ask the customer to choose waiting, cancelling, changing quantity, or changing color.

Predicted lead time / estimated ship-ready date should be estimated from current scheduling, replenishment queue, machine capability, and inventory context, but office staff must be able to edit the date or wording before copying/sending.

V1 predicted lead time should be conservative and rule-based, not a complex algorithm.

Recommended V1 prediction rules:

- if the same size / color is already in the pending replenishment pool or a near-term machine plan, use the existing planned date first
- if there is no existing plan but the size has known capable machines, estimate from earliest schedulable date plus expected production duration
- if mold change, handle/strap change, or material waiting is clearly needed, add setup / preparation buffer
- if the system cannot estimate reliably, show `estimated time pending confirmation` and let office staff enter or edit it manually

After enough data accumulates, lead-time prediction should improve by using historical production speed, actual machine capacity, mold-change duration, color/size replenishment cycles, seasonal demand, and order completion records.

V1 should not automatically send this message to customers. It only generates copyable text, so office staff can correct an unsuitable predicted date before sending.

After the customer replies, office staff can choose:

- `customer will wait`
- `customer will not wait, cancel this line`
- `customer changes quantity / color`
- `confirm later`

When the customer chooses `change quantity / color`, the system should not overwrite the original unavailable line. It should close / cancel the original line and create a new line.

The original line closure reason should be `customer changed quantity`, `customer changed color`, or `customer changed style`, and should retain the customer confirmation record.

The new line should rerun spec parsing, inventory lookup, inventory reservation, price snapshot, and later outbound / replenishment flow.

When the customer changes quantity / color / style because the original stock line is unavailable, the new line should default to the original order's customer order time and record the change time.

The new line should default to the original order / original line fulfillment method.

The latest ship date should require office confirmation because the customer may accept a new shipping date after changing quantity / color.

The new line price should default to the price table version matched by the original customer order time. If the change is actually a later additional customer request, it should be treated as a new order / new line and priced by the new customer order time.

Example: original line `30*38 black 300` is unavailable, and the customer says to change black to red. The system closes the black line with reason `customer changed color`, creates a new `30*38 red 300` line, and reruns inventory and pricing.

Example: customer ordered black 300 on June 1 and confirmed changing to red 300 on June 1. Price by the original June 1 order time and record the change time.

Example: on June 5, the customer says `add another red 300`; this is more like a new order / new line and should be priced by the June 5 customer order time.

If the new line is also unavailable after rerunning inventory lookup, the system should not enter a separate special flow. It should return to the same `waiting for customer decision on whether to wait` loop.

The system should generate a new copyable customer message for the newly unavailable line, so office staff can ask whether the customer will wait, cancel, change quantity / color / style again, or confirm later.

Each change should retain the full chain: original line, new line, closure reason, customer confirmation record, change time, and current handling status.

Example: `30*38 black 300` is unavailable, the customer changes to `30*38 red 300`, and red is also unavailable. The system shows that red is also unavailable and generates a new estimated lead time and copyable message.

Example: the customer then changes to `30*38 blue 300`, and blue is available. The blue line enters waiting for outbound, while the chain remains visible as black closed, red closed / pending confirmation, and blue waiting for outbound.

After the customer confirms they will wait, the system should generate another copyable confirmation message explaining which lines will ship first, which lines will be replenished / produced, and the estimated ship-ready date.

After the customer confirms they will wait, the shortage production / replenishment task quantity should be split into `customer-locked quantity` and `opportunistic stock replenishment suggested quantity`.

The `customer-locked quantity` must be protected for the original customer and must not be consumed by normal stock inventory or another customer.

The `opportunistic stock replenishment suggested quantity` should be recommended from safety stock, target stock, recent sales, current scheduling, and matching production conditions such as size, color, and handle type. Office staff must confirm it before it enters the pending replenishment scheduling pool.

Office staff can edit the total production quantity, such as producing only the customer shortage, producing the customer shortage plus some stock, or following the system suggestion to replenish toward target stock.

If the customer order and stock replenishment share size, color, handle type, and timing, the system should recommend continuous merged production to reduce mold changes, handle/strap changes, color changes, waste, and idle setup time.

Merged production must not hurt the customer due date. After production finishes, the customer-confirmed waiting quantity should be allocated to that customer first, and only the remaining quantity should enter stock inventory.

For non-custom production, including blank stock/common goods and printed stock/common goods, the planned quantity should be treated as a target quantity, not an exact stop quantity.

Non-custom production should support `finish the roll` as a production-strategy recommendation. For example, if one roll can produce about `3000` pieces and the current target is `1500`, the system may recommend finishing the roll to avoid changeover time and hard-to-store half-roll leftovers.

`Finish the roll` is not mandatory. The system should recommend it from backend data, and office / scheduling staff should confirm before execution.

When deciding whether to finish the roll, the system should consider current inventory, target inventory, recent sales, cycle-sales patterns, expected inventory turnover time, warehouse pressure, waiting customer orders, later machine plans, and roll-change / mold-change / handle-change cost.

After bag-size material-usage formulas and per-roll meters are available, replenishment suggestions / replenishment push messages should use `size-based material usage + per-roll meters` to roughly estimate how many pieces one roll can produce, how many rolls the target replenishment needs, and whether finishing the roll is reasonable.

In early V1, per-roll meters can default to `1500 meters per roll`, and replenishment suggestions can use a rough `one-roll` estimate rather than aiming for precision.

Replenishment suggestions / push messages should show the rough calculation basis to office staff instead of only showing a final recommendation.

The calculation basis should include at least current inventory, target inventory, shortage quantity, default per-roll meters, rough one-roll output for the size, recommended rolls / approximate pieces, expected inventory after replenishment, and recommendation reason.

The result must be clearly marked as `rough estimate` or `rough one-roll estimate`, and office / scheduling staff must be able to manually edit the suggested production quantity.

Example: `30*38 red` current inventory is `200`, target inventory is `3000`, and one roll is roughly estimated at `3000` pieces from `1500 meters per roll`. The system shows `recommend 1 roll / about 3000 pieces, expected inventory after replenishment 3200, reason: low inventory + strong recent sales`.

If data is insufficient, the system should show `rough one-roll estimate, manual confirmation recommended`, and allow staff to change it to the target quantity, an approximate half-roll quantity, or no replenishment for now.

Finish-the-roll decisions should not use manual labels. Office staff should not need to maintain tags such as `common item`, `slow-moving item`, or `cautious replenishment`.

When V1 has limited historical data, the system should make conservative recommendations from existing orders, current inventory, manually configured minimum / target stock, and any available short-term sales data. If evidence is insufficient, it should show `manual confirmation recommended` instead of defaulting to finishing the roll.

If the system predicts that the extra quantity will sit in stock for a long time, or if inventory pressure is high, the size/color is slow-moving, or a more urgent machine task is coming, it should recommend producing only the target quantity or only a small overage instead of finishing the roll.

If the actual qualified quantity differs from the planned production quantity, the system should allocate the `customer-locked quantity` to waiting customers first, and only put the remaining qualified quantity into stock inventory.

If the `customer-locked quantity` is already satisfied and stock replenishment actual quantity is lower than planned, it should not be treated as a severe exception by default. The system should record the target-stock shortfall and keep it in later inventory warning / replenishment suggestion logic.

If the `customer-locked quantity` is already satisfied and stock replenishment actual quantity is higher than planned, the extra qualified quantity should enter stock inventory by default, with an `over-planned inbound quantity` record.

Production plan-vs-actual differences for stock replenishment should record a reason. Recommended V1 fixed reasons include `finish the roll`, `roll length difference`, `avoid half-roll waste`, `planned quantity entry variance`, `reported quantity variance`, and `other`.

If the actual qualified quantity is not enough to satisfy the `customer-locked quantity`, the system should not put the quantity into stock inventory. It should mark `customer-locked quantity shortfall` and strongly remind office staff / management to handle it.

Recommended handling options for `customer-locked quantity shortfall` include continuing production, customer accepts short shipment, or changing the due date / continuing to wait.

Example: the customer needs `30*38 red 300`, and inventory is 0. The system suggests producing `1500` based on safety stock and sales, with `300` locked for the customer and `1200` entering stock inventory. Office staff can change it to only `300`, `800`, or `1500`.

Example: machine 1 is already making a `30*38 red` customer order, and the system finds that `30*38 red` stock is below target. It should suggest replenishing stock in the same run to avoid another handle/strap change or machine scheduling later.

Example: planned production is `1500`, with `300` customer-locked and `1200` for stock replenishment. Actual qualified quantity is `1100`; the system allocates `300` to the customer first and puts `800` into stock inventory.

Example: `30*38 red` has low inventory and strong recent sales. One roll can produce about `3000`, while the current replenishment target is `1500`; the system can recommend finishing the roll and producing `3000` to avoid half-roll handling and another roll change later.

Example: `30*38 special color` has weak recent sales. The current replenishment target is `1500`, but finishing the roll would create about `1500` extra pieces that may sit in stock for a long time; the system should recommend not finishing the roll and producing only the target quantity or a small overage.

Example: planned production is `1500`, with `300` customer-locked and `1200` for stock replenishment. Because the factory finishes the roll, actual qualified quantity is `1530`; the system allocates `300` to the customer, puts `1230` into stock inventory, and records `over-planned inbound 30` with reason `finish the roll / roll length difference`.

Example: planned production is `1500`, with `300` customer-locked and `1200` for stock replenishment. After finishing the roll, actual qualified quantity is `1300`; the system allocates `300` to the customer, puts `1000` into stock inventory, and keeps the remaining target-stock shortfall `200` in inventory warning logic.

Example: planned production is `1500`, with `300` customer-locked, but actual qualified quantity is only `250`. The system marks `customer-locked quantity shortfall 50`, sends a strong reminder, and does not allow the line to be silently completed into stock.

This confirmation message should also be copy-only and not automatically sent. Office staff can edit the date and wording before sending.

Example confirmation message: `OK, we will arrange replenishment for 30*38 black 300 pieces, estimated ready to ship in 2 days. We will arrange outbound first for 30*38 red 500 pieces and 25*32 white 200 pieces.`

When office staff choose `confirm later`, the system should automatically create a follow-up reminder so the office does not forget to ask the customer again.

V1 can default to reminding office staff after 2 hours, while allowing manual change to a specific reminder time such as tomorrow morning.

Because many stock/common-goods orders require delivery or customer pickup, the system should not let unavailable-line confirmation wait too long. If the latest delivery / pickup time is approaching and the customer still has not confirmed, the system should show a strong reminder and suggest calling the customer.

If the customer keeps not replying, the follow-up reminder should show `recommend phone call`, so office staff or management can call the customer to confirm.

`Confirm later` should store last contact time, next reminder time, reminder owner / responsible account, and notes.

Recommended unavailable-line statuses:

- before customer reply: `waiting for customer decision to wait`
- customer agrees to wait: `waiting for replenishment / production`
- scheduled: `scheduled`
- production completed: `waiting for outbound`
- delivered to customer: `completed`

`Waiting for replenishment / production` should show customer-confirmed waiting, predicted lead time / estimated ship-ready date, and shortage quantity.

Example: `30*38 black 300` has no inventory, and the customer says they can wait two days. The system shows `waiting for replenishment / production (customer will wait, estimated ready to ship in 2 days)`.

`Ship inventory + produce shortage` should keep the same original order and order-line relationship for customer recognition and reconciliation. Internally, the system can create one outbound task and one shortage production / replenishment task.

Example: customer orders `30*38 red 1,000 pieces`, but warehouse inventory has only 600 pieces. The system shows 600 available and 400 shortage. Office staff can choose all-to-production, ship 600 and produce 400, or change accepted quantity to 600.

Example: customer orders `30*38 red 500`, `30*38 black 300`, and `25*32 white 200`. Red and white have inventory and enter `waiting for outbound`; black has no inventory, so office staff asks whether the customer will wait. If the customer will not wait, the black line is cancelled. If the customer will wait, the black line creates a shortage replenishment task.

Example copyable message: `The 30*38 black 300 pieces you ordered are temporarily out of stock and are estimated to be ready to ship in 2 days. The 30*38 red 500 pieces and 25*32 white 200 pieces can ship first. For the black item, would you like to wait, cancel it, or change quantity/color?`

This is a fulfillment / production split after human confirmation, not automatic system splitting.

When a stock/common-goods order line enters `waiting for outbound`, the system should immediately reserve / lock the matching inventory to prevent the same stock from being sold twice.

Inventory quantities should distinguish `on-hand inventory`, `reserved inventory`, and `available inventory`. `Available inventory = on-hand inventory - reserved inventory`.

Inventory reservations should be stored per order line and link to size, color, handle type, finished-goods style, warehouse/location, reserved quantity, reservation time, and reservation source.

Finished-goods inventory locations should support zone management. On site, plain stock/common goods are usually stored together and arranged by model/size, while printed stock/common goods are stored in a separate area. The system location field should support at least zone / area type, model/size, color, finished-goods style, and notes.

Recommended V1 zone / area types: plain stock/common goods area, printed stock/common goods area, prepared-goods area, waiting-pickup area, waiting express / less-than-truckload area, exception / pending handling area, and other.

V1 location granularity should stay lightweight. It should not require shelf number, shelf layer, or bin/cell number. Managing by `zone + model/size group + color/finished-goods style + notes` is enough.

Location examples: `plain stock area / 30*38 / near red`, `plain stock area / 25*32 / white`, `printed stock area / bear / 25*23`, and `waiting-pickup area / customer A / tail number`.

Later, if warehouse organization becomes stable and shelf labels are clear, the system can add shelf number, layer number, bin number, or QR-coded location labels. V1 should not block outbound work because location detail is not fine enough.

When the same exact inventory item exists in multiple batches or locations, the system can use `FIFO` as the recommended deduction order, meaning earlier inbound stock is recommended first. This is only a recommendation and should not be forced on the shop floor.

Outbound staff should pick from the location that is practical on site. When outbound is completed, the system should record the actual outbound location, quantity, operator, and time. If the actual location/batch differs from the system recommendation, it should not be treated as an exception; the actual outbound record is the source of truth.

Example: warehouse has 1,000 pieces of `30*38 red`. Customer A's 600-piece order enters `waiting for outbound`, so the system reserves 600 and available inventory becomes 400. If customer B orders 500 pieces, the system shows only 400 available and 100 shortage.

If an order is cancelled, rejected, quantity-changed, moved to all-production, or manually released before outbound, the system should release or adjust the matching reserved quantity.

On normal `complete outbound`, the system should default this outbound quantity to the expected / reserved quantity, deduct inventory, and clear the matching reservation.

Legacy or imported records that lack per-order reservation rows must not silently deduct inventory by default. They may use an explicit `legacy unreserved deduction` path only when a human or migration flow enables it, the system can uniquely match the exact inventory item by size, color, handle type, and finished-goods style, inventory is sufficient, and the order is stock/common-goods or printed stock. Custom printed orders, outsourced work, or records that cannot match a unique inventory item should go to manual handling / inventory correction instead of automatic deduction.

If the actual found or delivered quantity differs from the expected / reserved quantity, staff must not directly change the quantity and force `complete outbound`. They must use the `quantity mismatch` exception flow first. Office staff or another permitted account then decides whether the customer accepts the actual quantity, staff continues searching, waits for replenishment, cancels the remainder, changes quantity, or creates an inventory adjustment; only after that confirmation should the system deduct inventory, release the difference, or add reservation according to the confirmed result.

Only order lines that enter `waiting for outbound`, formal orders in `fulfillment pending confirmation`, or manually confirmed holds should reserve inventory. A parsed preview alone should not reserve inventory.

`Pending confirmation` stock/common-goods orders should not reserve inventory by default. They should only show whether the current available inventory can satisfy the order.

If the customer asks the office to hold the goods, or office staff decides a short hold is needed, office staff can click `hold inventory`; only then should the system reserve inventory.

`Hold inventory` must have an expiry time. V1 can default to automatic release at 19:30 on the same day, to avoid unconfirmed orders holding inventory indefinitely.

`Hold inventory` should record holder, hold time, hold expiry time, hold reason, order line, and reserved quantity.

When the hold expires, if the order has not moved to `waiting for outbound` / formal `fulfillment pending confirmation` and the hold has not been extended, the system should automatically release the reserved inventory and keep a release record. Formal orders in `fulfillment pending confirmation` should not be auto-released by the temporary-hold expiry rule.

Examples:

- `medium red bag 500 pieces` is pending confirmation because size is ambiguous, so it does not reserve inventory; after office staff confirms `40*30 red 500`, it enters `waiting for outbound` and reserves inventory
- customer says `please hold it for me`; office staff clicks `hold inventory`, inventory is reserved until 19:30 the same day, and if still unconfirmed then it is automatically released

If outbound staff finds that actual inventory is insufficient for a reserved stock/common-goods order, the system must not silently mark it as outbound completed. It should enter `inventory variance handling`.

`Inventory variance handling` should show order line, reserved quantity, actually found quantity, variance quantity, inventory item, warehouse/location, outbound operator, and handling time.

Recommended V1 handling options:

- `actual outbound + shortage to production`: outbound the actually found quantity and create a production / replenishment task for the shortage
- `actual outbound + customer accepts short shipment`: outbound the actually found quantity, record customer confirmation, and later reconcile by actual delivered quantity or allowance
- `cancel this outbound, wait until replenished`: do not complete outbound; keep the order waiting for handling / replenishment
- `correct inventory quantity` / `inventory count adjustment`: confirm that book inventory was wrong and create an inventory adjustment record

Normal outbound staff can initiate `correct inventory quantity`, but they cannot directly change system inventory.

After outbound staff initiate `correct inventory quantity`, the system should create `inventory adjustment pending confirmation`. The adjustment takes effect only after office staff or an account with `inventory adjustment confirmation` permission confirms it.

The inventory adjustment confirmation record should include initiator, confirmer, confirmation time, quantity before adjustment, quantity after adjustment, variance quantity, reason, linked order line, and notes.

V1 inventory adjustment reasons should use fixed options plus optional notes, so later statistics can group variance causes.

Recommended fixed reason options:

- wrong location searched
- inventory count shortage
- inventory count overage
- outbound not recorded
- inbound / workshop report quantity inaccurate
- damaged / polluted / unsellable
- workshop-reported inventory variance
- historical inventory inaccurate
- other

Optional notes can capture details such as specific location, same-day operation context, customer / order background, or what was found on site.

`Inventory adjustment pending confirmation` belongs in the `approval` queue because confirmation changes inventory book quantity.

Small quantity / low amount inventory adjustments should default to the pending-confirmation list without immediate push.

Large quantity or high estimated amount inventory adjustments should immediately push to accounts with `inventory adjustment confirmation` permission and notifications enabled.

Immediate-push thresholds for inventory adjustment should be configurable. V1 can start with two threshold types: quantity variance and estimated amount.

All inventory adjustments, regardless of size, must keep records so later statistics can show which size, color, warehouse/location, worker, or inventory source has frequent variance.

If office staff confirms that the worker looked in the wrong location, the goods are somewhere else, or inventory should not be adjusted, they can reject the pending adjustment and switch the handling path to continued outbound, outbound from another location, or wait until replenished.

Inventory adjustment only corrects inventory book quantity. It must not directly advance the customer order status.

Customer order progress should be determined by the inventory variance handling result: actual outbound, shortage production, customer-accepted short shipment, or waiting until replenished.

Examples:

- `actual outbound + shortage to production`: the order becomes partially outbound, and the shortage enters pending production / replenishment
- `customer accepts short shipment`: the order continues based on actual delivered quantity and later reconciliation by actual delivery or allowance
- `cancel this outbound, wait until replenished`: the order remains waiting for replenishment
- `correct inventory quantity`: only fixes the inventory book quantity; it does not mean the order is completed

For `actual outbound + shortage to production`, the internal order should show original ordered quantity, delivered quantity, pending delivery quantity, and shortage production / replenishment status.

Example: original order quantity 1,000, first outbound / delivered quantity 600, shortage 400 to production. The internal order shows original ordered 1,000, delivered 600, pending delivery 400.

The shortage should not enter customer reconciliation before it is actually delivered.

For stock/common-goods lines where the customer agrees to wait for unavailable goods, the shortage production / replenishment task remains linked to the original order line and should be prioritized to fulfill that customer when completed. If the customer later cancels the shortage, the line is cancelled / closed; any produced goods not needed by the customer can become normal stock inventory.

For `actual outbound + customer accepts short shipment`, the internal order must keep both original ordered quantity and actual outbound / shipped quantity. Do not overwrite the original ordered quantity.

Recommended order display fields:

- ordered quantity
- actual outbound / shipped quantity
- variance quantity
- variance handling result
- customer confirmation record

Example: ordered quantity 600, actual outbound / shipped quantity 550, variance shortage 50, variance handling `customer accepts short shipment`, confirmation record by phone / WeChat / Enterprise WeChat.

Saving `customer accepts short shipment` must require a lightweight customer confirmation record, but does not require approval.

Required fields:

- confirmation method
- confirmation content

Recommended confirmation methods:

- phone confirmation
- WeChat confirmation
- Enterprise WeChat confirmation
- on-site pickup confirmation
- other

Optional fields:

- chat screenshot / evidence photo
- notes

The system should automatically record confirmation entry operator and entry time.

Examples:

- phone confirmation: `phone confirmed, customer accepts 550 pieces`
- WeChat / Enterprise WeChat confirmation: upload screenshot or enter chat note
- on-site pickup confirmation: enter pickup person and confirmation note

The order status should show something like `completed (short shipment confirmed)`, not plain `completed`, to avoid implying full delivery.

Outbound, delivery, inventory deduction, and reconciliation quantity should use actual delivered quantity 550, not original ordered quantity 600.

Example: the system reserved 600 pieces of `30*38 red`, but outbound staff finds only 550. The system shows a 50-piece variance and requires a handling choice before completion.

Inventory variance records should link to the original order line and inventory ledger. Later statistics can use them to measure warehouse inventory accuracy, workshop-reported inventory variance, and count issues.

The system should also provide regular inventory warnings and replenishment suggestions, such as recommending replenishment for a specific color and size. Suggestions should consider minimum stock thresholds, recent demand, and common size/color patterns.

Replenishment reminders should be tiered to avoid pushing every order-entry shortage.

Office clerks enter orders on desktop computers. When a shortage is found during order entry, the system should first show an in-page desktop reminder on the order-entry screen, including shortage quantity, available inventory, estimated replenishment / production suggestion, and copyable customer message text. It should not default to a mobile push.

The system should generate a fixed daily replenishment summary push for office / scheduling staff. V1 can default to 4 PM, so staff can combine today's orders, inventory, and tomorrow's scheduling decisions before confirming replenishment.

The 4 PM replenishment summary should enter the office / production-management shared todo pool. Actions are `confirm`, `ignore`, and `remind later`.

Ignoring a replenishment suggestion requires a fixed reason, such as `inventory not trusted`, `customer may cancel`, `avoid overstock for now`, `machine unavailable`, `raw material unavailable`, or `other`.

Severe shortages or risks to already-promised customer due dates should immediately strong-remind relevant staff, such as when a customer has agreed to wait but the system predicts the customer-locked quantity may not be ready in time.

Replenishment push recipients should be configured by account permissions, not hard-coded person names. Recommended recipients include office staff, scheduling staff, inventory / replenishment owners, and management-view accounts.

Normal replenishment suggestions can be confirmed collaboratively by office clerks and the production supervisor. In the current factory, office clerks and the production supervisor work in the same area and can communicate offline easily, so the system should not turn normal replenishment into a heavy approval workflow.

After an office clerk or production supervisor confirms a normal replenishment suggestion, it enters the `pending replenishment scheduling pool`.

If the replenishment quantity is clearly large, estimated inventory turnover is too long, the suggestion may create long-lived overstock, or it may consume machine time needed for already-promised customer orders, it should enter the `boss review / management watch` list.

`Boss review / management watch` is a reminder by default and should not block the normal replenishment record. The reviewer can still request reducing quantity, postponing replenishment, or changing scheduling.

Example: customer orders `30*38 red 500`, and inventory is insufficient. The desktop order-entry page shows the shortage and estimated replenishment, but does not immediately send a mobile push.

Example: at 4 PM, the system pushes a summary such as `recommended for tomorrow: 30*38 red 1 roll, 25*32 white around 0.5 roll`; office / scheduling staff confirm before it enters the pending replenishment scheduling pool.

Example: `30*38 red` is recommended for 1 roll, with low inventory and strong sales. The office clerk and production supervisor can confirm it together, and it enters the pending replenishment scheduling pool.

Example: a special color is recommended for 1 roll but estimated turnover is over 60 days. The system flags overstock risk and adds it to boss review / management watch; the office clerk / production supervisor can reduce the quantity or skip replenishment for now.

Example: customer already agreed to wait for `30*38 red 300`, but after scheduling the system predicts the customer-locked quantity may miss the due date. The system immediately strong-reminds office / management to handle it.

Inventory warnings should use a hybrid model:

- manually configured minimum stock and target stock for each exact inventory key: size / model + color + handle type + finished-goods style
- no automatic warning when a stock item has no minimum / target stock configured; the system keeps sales statistics and leaves replenishment to manual judgment
- replenishment checks based on `available stock = in-stock quantity - reserved quantity - waiting-pickup locked quantity - pending-handling / scrap quantity`
- dynamic suggestions based on recent 7 / 15 / 30 day sales, with the most recent 7 days weighted highest in early V1
- low-confidence labeling when data is insufficient
- suggested replenishment quantity based on `target-stock shortage + customer-confirmed waiting quantity`, with a rough one-roll output hint
- no replenishment suggestion for very low 30-day sales when stock is not below minimum stock; if below minimum stock, suggest replenishing only near minimum stock instead of target stock
- replenishment priority: customer already waiting, urgent stock shortage, below minimum stock, dynamic sales suggestion, then opportunistic finish-the-roll production
- common high-frequency and slow-moving items should be inferred from sales volume, order frequency, inventory turnover, and cycle demand, not maintained as manual tags
- higher suggested targets for common high-frequency items
- lower pressure for slow-moving items
- V1 should not automatically create production work orders; it should create replenishment suggestions that office staff confirm before conversion into production work orders
- confirmed replenishment suggestions should enter a pending replenishment scheduling pool instead of directly becoming fixed work orders
- `confirm replenishment` and `formal machine scheduling` should be two separate steps
- `confirm replenishment` only means the office clerk / production supervisor accepts the replenishment need and moves it into the `pending replenishment scheduling pool`; it is not yet bound to a specific machine or production time and should not be treated as scheduled production
- `formal machine scheduling` happens when the production supervisor or an account with scheduling permission assigns the replenishment task to a specific bag-making machine, date, and sequence; only then does it become a formal production work order
- if the machine is not yet known, the replenishment task should remain in the pending replenishment scheduling pool and wait to be matched with customer orders
- example: at 4 PM, the office clerk confirms `30*38 red replenishment 1 roll`; it enters the pending replenishment scheduling pool. The production supervisor sees machine 1 will make `30*38` tomorrow and schedules the replenishment task after that machine's customer order
- example: if tomorrow's `30*38` machine plan is still uncertain, the replenishment task stays in the pool and does not become a formal machine work order
- replenishment tasks should be scheduled together with customer orders
- customer due dates remain the priority; replenishment tasks should be dynamically inserted based on inventory risk and forecast demand
- after a replenishment task is formally scheduled to a machine, the production supervisor / office clerk can still adjust sequence based on urgent orders and shop-floor conditions
- normal replenishment tasks default to lower priority than already-promised customer orders; temporary customer rush orders can be inserted before normal replenishment tasks
- replenishment sequence changes must keep an audit record with operator, operation time, original machine / sequence, new machine / sequence, and adjustment reason
- if the replenishment task includes `customer-locked quantity`, the system should check whether the adjustment may affect the promised customer due date; if it may, show a strong reminder and require a confirmation reason
- `customer-locked quantity` should not be treated like normal stock replenishment and moved back casually when that would affect the due date
- example: machine 1 tomorrow is customer order A -> `30*38 red replenishment 1 roll`. A rush order B arrives in the evening, and office staff inserts B before the replenishment task. The system records the replenishment task moving from position 2 to position 3 with reason `customer rush insertion`
- example: if the `30*38 red replenishment` includes `300` customer-locked pieces for a waiting customer, the system checks whether moving it back will miss the due date; if yes, it strongly reminds the office clerk / production supervisor
- if a customer order and replenishment task share size, color, handle/strap setup, or other production conditions, the system should recommend continuous production to reduce changeovers, handle/strap changes, waste, and idle setup
- bag handle material, width, and gram weight are fixed and do not vary
- handle type has only two values: normal/default length and extended handle
- customers generally do not state use/category when ordering; they state model/size, color, quantity, and sometimes extended handle
- if extended handle is not mentioned, default to normal/default handle
- if extended handle is mentioned, use extended handle
- do not require a first-version category/use field such as advertising bag or clothing-store bag
- core parsed fields should be model/size, color, quantity, and handle type
- handle type affects bag price and batching/continuous-production matching

Customer purchase history is part of this inventory intelligence. After the system runs for a cycle, customer, size, color, ordering-frequency, cycle-sales, and busy/slow-season data should improve replenishment suggestions. The business has seasonal busy and slow periods, so later versions should support cycle/season-based demand forecasting to reduce inventory pressure. As more data accumulates, replenishment quantity, replenishment timing, and merged-production suggestions should become more accurate.

## Finished-Goods Zones, Cycle Counts, And Safety Stock

V1 finished-goods location management should start with `zone + model/size grouping + notes`. It should not start with detailed shelf, layer, or bin management.

Example zones can include plain stock/common-goods area, printed stock/common-goods area, express / less-than-truckload waiting-pickup area, pending-handling area, and workshop-reported / loose-stock area.

Because the current warehouse locations are still messy, the system should allow blank, pending-cleanup, or temporary location notes. Incomplete location cleanup must not block outbound.

Finished-goods inventory status must be separated at least into:

- warehouse-counted inventory
- workshop-reported / loose inventory
- reserved inventory
- waiting-pickup locked inventory
- pending-handling / pending-scrap inventory

Different inventory statuses may appear in inventory lookup, but their trust levels differ.

`Warehouse-counted inventory` is the most trusted source and can support direct waiting-for-outbound flows.

`Workshop-reported / loose inventory` can participate in inventory lookup and replenishment judgment, but the UI should clearly show its unreviewed source and automatic routing should be more cautious.

`Waiting-pickup locked inventory` is still physically inside the factory, but it already belongs to a self-pickup, delivery, express, or less-than-truckload task and must not be allocated to another order.

V1 should use `cycle count / correction` first. It should not require forced full-warehouse monthly stocktaking.

A full-warehouse stocktake means stopping to count every zone, size, color, and finished-goods style. That is too heavy for V1.

A cycle count means checking selected high-risk inventory, such as items with recent outbound quantity mismatch, workshop-reported loose inventory, fast-moving stock, zones with frequent variances, waiting-pickup inventory, or pending-handling inventory.

Correction means that after counting, if the system quantity and physical quantity differ, an authorized account confirms the difference and the system creates an inventory adjustment ledger entry.

Example: the system shows `30*38 red normal-handle blank bag` as 500 pieces, but a cycle count finds 430 pieces. An outbound worker may initiate the correction; office staff or another account with inventory-adjustment permission confirms it; the system records a 70-piece decrease with reason and audit history.

Inventory corrections must not silently rewrite quantities. They must record system quantity, counted physical quantity, difference quantity, reason, initiator, confirmer, and timestamps.

Outbound workers, office staff, and production supervisors may initiate inventory corrections.

Inventory corrections take effect only after office staff or an account with inventory-adjustment permission confirms them.

Normal inventory variances do not require boss approval.

Inventory adjustments above configured quantity or value thresholds enter boss / management review, but this review should not block the confirmed correction from taking effect.

Safety stock should be configured by exact inventory key: `size/model + color + handle type + finished-goods style`.

Each inventory item can have manually configured minimum stock and target stock.

If minimum stock and target stock are blank, the item should not trigger automatic replenishment warnings. It remains visible for sales statistics, inventory lookup, and manual planning.

Replenishment logic should use `available stock = in-stock quantity - reserved quantity - waiting-pickup locked quantity - pending-handling / scrap quantity`.

The system should then use recent 7/15/30-day sales, customer purchase cycles, busy/slow-season signals, and current order trends to suggest raising or lowering those values. Early V1 can weight 7-day sales highest and use 15/30-day windows to smooth the signal.

When data is insufficient, suggestions should be marked low confidence and should not automatically raise safety stock.

Fast-moving items should naturally receive higher suggestions from data. Office staff should not have to maintain manual tags such as `common item` or `slow-moving item`.

Slow-moving items should not be forced down automatically. The system should only show slow-turnover risk or conservative replenishment suggestions. If 30-day sales are very low and stock is not below minimum stock, no replenishment suggestion should be generated; if stock is below minimum stock, suggest replenishing only near minimum stock rather than target stock.

The default replenishment quantity should be `target-stock shortage + customer-confirmed waiting quantity`, plus a rough one-roll output hint from the current size, default roll length, and material formula.

Customer orders and stock replenishment can be merged into the same production run when size, standard color, handle type, finished-goods style, machine capability, and timing match. Customer-locked quantity is protected first; only the remainder is stock replenishment.

Replenishment priority is customer already waiting, urgent stock shortage, below minimum stock, dynamic sales suggestion, and then opportunistic finish-the-roll production.

V1 must not automatically create production work orders from replenishment logic. It should create replenishment suggestions first.

Only after office staff or production management confirms a suggestion should it enter the pending replenishment scheduling pool or become a production task.

Replenishment suggestions should show their calculation basis: current inventory, reserved quantity, target stock, shortage, recent 7/15/30-day sales, suggested replenishment quantity, and recommendation reason.

Every inventory change should create an inventory ledger entry, including production inbound, workshop-reported quantity, outbound, reservation, release, waiting-pickup lock, express / less-than-truckload pickup confirmation, supplemental shipment, cycle-count correction, scrap, and cancellation release.

The inventory ledger supports traceability, inventory forecasting, loss analysis, and responsibility investigation.

## Business Statistics Requirements

After-sales / customer complaints should be part of business statistics.

Customer-level after-sales statistics should include complaint count, issue-type distribution, short-shipment count, wrong-goods count, print-problem count, supplemental-shipment count, exchange count, compensation / discount amount, and unresolved after-sales count.

Internal responsibility statistics should include responsible step, responsible account / operator, responsible machine, responsibility count, performance / deduction count, deduction amount, and common issue types.

Examples:

- one customer reports short shipment 3 times in a month
- one customer often reports print problems
- one customer frequently requests compensation
- one packing worker is frequently responsible for short shipment
- one silk-screen machine has many print problems

These statistics support both customer management and internal performance / process improvement.

Order entry should show non-blocking customer risk hints.

Examples:

- current debt amount
- overdue debt
- unresolved after-sales count
- high complaint count in the last 30 days
- frequent recent temporary packing changes

Risk hints must not block order entry. Office staff can still save the order; management decides manually whether to pause cooperation or handle specially.

V1 risk hints should use two levels: normal hint and strong hint.

Normal hint examples:

- one unresolved after-sales item
- recent temporary packing change
- small current debt that is not overdue

Strong hint examples:

- debt above the configured threshold
- overdue debt
- high complaint count in the last 30 days
- large after-sales / compensation amount

Strong hints should be highlighted on the order-entry screen and added to the boss-review list, but they still must not block office staff from saving the order.

## Machine Data Requirements

Store bag-making machine capabilities as structured data. Current machine capability list:

| Machine | Capability |
| --- | --- |
| 1 | 30x38x10 cm vertical |
| 2 | 40x30x10 cm horizontal; 40x32x10 cm horizontal |
| 3 | 35x27x10 cm horizontal |
| 4 | 25x32x10 cm vertical; 35x41x12 cm vertical; 50x40x12 cm horizontal |
| 5 | 25x32x10 cm vertical |
| 6 | 30x38x10 cm vertical; 25x32x10 cm vertical; 40x32x10 cm horizontal; other special models |
| 7 | 30x38x10 cm vertical; 25x32x10 cm vertical |
| 8 | 30x36x8 cm vertical; 35x27x10 cm horizontal; 35x41x12 cm vertical; other special models |
| 9 | 30x38x10 cm; 30x36x8 cm; 45x37x10 cm horizontal |

## Helper Material Preparation Task Pool

The current 9 bag-making machines are distributed across 3 workshops. The 3 helpers usually each cover one workshop, around 3 bag-making machines, and handle raw-material preparation, material delivery to machines, packing assistance, and similar helper work.

The system should support configurable `workshop/zone - bag-making machine - helper account` responsibility mapping. For example, workshop A can cover machines 1-3, workshop B machines 4-6, and workshop C machines 7-9, but the grouping must be configurable rather than hard-coded.

V1 can initialize the default mapping as `workshop 1 = machines 1-3`, `workshop 2 = machines 4-6`, and `workshop 3 = machines 7-9`, but the backend must allow workshop, machine, and helper-account bindings to be edited.

A helper account should by default see only the material-preparation task pool and packing task pool for the workshop/zone they currently cover. Office staff, production supervisor, and management accounts can view all workshops.

If a helper temporarily supports another workshop, office staff, the production supervisor, or another permitted account should temporarily switch / authorize that visible scope, with authorizer, time, and scope recorded.

The material-preparation task pool should be generated only from `published schedules`: formally scheduled bag-making work orders, customer orders, stock replenishment tasks, and replenishment + customer-locked tasks. Draft schedules should not push tasks to helpers, to avoid repeated material movement after schedule edits.

Material-preparation tasks should be grouped by `today / tomorrow`, `morning / afternoon / current batch`, workshop, machine, and production sequence.

Each material-preparation task should show at least: workshop/zone, machine, task type, size, color, raw-material type, material width, estimated rolls/meters/weight, planned start or latest ready time, rush flag, linked production task/order, and whether a specific raw-material roll/batch has already been selected/reserved.

If material-usage formulas are not complete, V1 can generate preparation hints from the schedule, size/color, manually maintained material-width rules, and rough `one-roll` estimates. These hints must be marked as `rough estimate / pending confirmation`, and office staff or the production supervisor must be able to edit them.

The first bag cost/material formula has been provided. After the formula set is entered into the system, it should feed estimated rolls/meters/weight in material-preparation lists, replenishment suggestions, material-cost estimates, and order/machine gross-margin estimates.

Even after formulas are available, preparation quantities must remain manually editable by office staff or the production supervisor because actual roll length, leftovers, color sequencing, finish-the-roll decisions, and schedule changes can affect the final material preparation plan.

The helper list should include a workshop-level `today's material to prepare` summary, so the helper can quickly see which colors, material widths, and approximate rolls are needed. Example: `workshop 1 today: red width xx 1 roll, white width yy around 0.5 roll`.

Single task example: `today | workshop 1 | red fabric | width xx | 1 roll | machine 1 before 09:30`.

Detail example: `machine 1: customer A 30*38 red 500 pcs + 30*38 red replenishment 2500 pcs`, with recommended roll/batch such as `recommend R001` or `any available roll matching red / width xx`.

The system may recommend or reserve raw-material roll IDs, but V1 should not force every material-preparation task to lock a specific roll in advance. The roll actually scanned by the helper becomes the authoritative machine-side pickup record.

Recommended roll IDs are meant to reduce searching and wrong material selection. They should not block on-site roll replacement, rush insertion, or use of a more suitable available roll.

V1 should allow `machine-side material staging`: a helper may push 1-3 rolls of material suitable for that machine/workshop's near-term tasks to the machine side. The system should not assume one order maps to one roll.

Helpers can prepare and deliver multiple raw-material rolls at once for a machine's `today morning / today afternoon / current batch` tasks. This matches the shop-floor rhythm better than delivering one roll at a time strictly in production sequence.

For custom printed orders, if they are already scheduled to the machine for that day/current batch and will definitely be produced, staging the material early beside the machine is equivalent to delivering it in sequence. V1 should not force roll-by-roll delivery based on document order.

The material-preparation list should support machine time-window summaries, such as `machine 1 morning materials: red width xx 1 roll, white width yy 1 roll, black width zz around 0.5 roll`.

Small fragmented orders, rush insertions, and opportunistic replenishment are often interleaved in production. V1 should not force helpers or bag-making workers to scan-switch material, transfer material, or end material usage every time a small order changes.

Recommended V1 material-preparation statuses should stay simple: `pending preparation`, `found/reserved`, `machine-side material pickup`, and `exception`.

`Found/reserved` only means this raw-material roll/batch is held for the workshop, machine, or near-term task group. It does not mean material cost has occurred or that raw-material inventory has been officially issued.

V1 should not force helpers or bag-making workers to distinguish `delivered to machine side` from `mounted / started using`, because that creates an unclear judgment burden on site.

`Machine-side material pickup` is the single required helper confirmation action. It means the material has reached the machine side or is ready to be mounted, and the system moves that roll/batch from warehouse-available raw material to machine-side material / machine-held material.

The current implementation has the first V1 `machine-side material pickup` boundary: only physically labeled, phone-scanned / signed, and available raw-material rolls or pieces can create `RMI-ISS-*` issue records. The action records machine, optional production task, purpose, operator, and time, and is allowed for warehouse / packing-helper / management permissions rather than ordinary office users. Full-roll / full-piece issue moves the roll / piece to `machine-side issued`. Measured split-roll issue by weight creates an `RMI-SPLIT-*` record, keeps the source roll available with the remaining weight, creates a machine-side child roll such as `RM-...-S01`, and links the issue record back to the source roll and split record. Partial-piece splitting is still blocked until real piece-splitting rules are confirmed. The action does not create finished-goods output, does not treat machine counters as qualified quantity, and does not allocate cost or margin.
The current implementation also has the first V1 production-task matching rule for raw-material issue. Empty `productionTaskId` is allowed but the issue must be marked `unlinked to production task`, and cost allocation must not proceed until the task is filled. When `productionTaskId` is provided, the backend requires the production task to exist, the issue machine to match the task machine, and bag-body material color to match the order-line bag color; obvious mismatches are rejected with stable business errors. Handle-material matching is marked for manual review until real handle-color / handle-type rules are expanded.

`Machine-side material pickup` does not mean the whole roll has been consumed or that it is final order cost. Actual consumption and gross-margin estimates should be calculated after production reporting, end-of-roll, leftover return, or inventory adjustment.

V1 leftover registration should also stay lightweight. It should not require staff to record every small remainder.

Leftover registration should be triggered only when it has operational value, such as the roll returning to a warehouse/location, moving from one machine to another, end-of-day or stage stocktaking, a clearly large remainder such as half a roll or a reusable quantity, or when office staff / the production supervisor asks for a record.

If the remaining material will stay beside the same machine and continue to be used for later same-spec / same-color tasks, it can remain as that machine's `machine-side material` without immediate leftover registration.

If machine-side leftover material remains beside the same bag-making machine across days, V1 should keep it assigned to that machine by default. The system should not automatically return it to warehouse inventory or create a leftover-return record.

On the next day, the helper / production-supervisor task view should show it as `yesterday's machine-side leftover` and provide lightweight actions such as `continue using`, `return to location`, `move to another machine`, and `stocktake adjustment`. If staff choose `continue using`, no repeated material-pickup action is required.

Only `return to location`, `move to another machine`, or `stocktake adjustment` should create the corresponding inventory ledger entry and update the material location/status.

Leftover registration can use rough values first, such as about half a roll, approximate meters, or approximate kg. The system should mark these as `estimated`, and later stocktaking or reuse can correct them.

V1 should not require bag-making workers to scan or confirm raw materials a second time after helpers deliver them, to avoid adding work to the machine operators.

After the helper delivers material to the machine and participates in mounting the roll, the helper can complete `delivered to machine / mounted and issued` on mobile: confirm the machine or that machine's daily task group first, scan the raw-material roll/batch code, and let the system record helper account, time, machine, linked task group where available, and roll/batch.

The bag-making worker mobile detail can show the raw-material roll/batch, color, width, and specification currently issued / staged at the machine as read-only information, without requiring a confirmation tap.

If the bag-making worker notices wrong color, width, GSM/specification, or other mismatch, they should use `report exception` or ask the helper / production supervisor on site. Bag-making-worker scan confirmation should not be a required V1 step.

Recommended fixed exception reasons: material not found, wrong color, wrong width, wrong GSM/specification, missing/damaged roll label, roll already reserved by another task, abnormal actual meters/weight, schedule changed, and other.

Material-preparation exceptions should enter office / production supervisor handling. An account with permission decides whether to choose another roll, change task, wait for material, adjust schedule, or continue with manual confirmation.

If office staff or the production supervisor inserts a rush order, changes machine assignment, or changes sequence, the helper material-preparation pool should update accordingly and retain task-change traces so helpers do not deliver material according to an old list.

If the schedule changes after material has already been delivered to machine side, the system should not automatically return it to inventory or move it to another machine. It should mark the material as `machine-side pending handling`, and office / production supervisor can choose to keep it at the machine, move it to another machine, return it to the raw-material area, or keep it waiting for later use.

If a roll remains machine-side for more than one day without a linked in-progress task or tomorrow task, it should enter the helper / production-supervisor review list. This is a reminder only, with no automatic return and no automatic responsibility deduction.

## Reporting Requirements

Workshop mobile reports should auto-flow to the next state only when the reported quantity is within normal tolerance. Short quantity or excessive overrun should enter office/customer confirmation instead of automatically completing or moving to fulfillment.

Required reporting data:

- operator
- timestamp
- task/order
- completed quantity
- photos where required
- exception reason when outside tolerance
- leftover/loss details where relevant

Bag-making workers receive assigned orders/tasks in the workshop mobile side, produce them in sequence, submit completion reporting, then move to the next task.

The bag-making mobile task list should distinguish task types such as `customer order`, `replenishment`, `replenishment + customer-locked`, and `custom printed order`, while keeping the list compact.

The mobile list should show only the fields workers need for quick recognition and machine setup: task type, size, color, handle type, planned / target quantity, machine, sequence, rush flag, and latest completion / shipping time.

Customer-name display should follow the task type: normal customer orders and custom printed orders show the customer name for recognition; pure stock replenishment does not show a customer name; `replenishment + customer-locked` shows the locked customer name and locked quantity.

Stock replenishment list example: `replenishment | 30*38 red | suggested 1 roll / about 3000 | inbound to stock`.

Replenishment with customer-locked quantity example: `replenishment + customer-locked | 30*38 red | locked customer A 300 | remainder to stock`.

Customer order list example: `customer order | 30*38 red | customer A | quantity 300 | ship by tomorrow`.

Pure replenishment list example: `replenishment | 30*38 red | about 3000 | inbound to stock`.

Customer-locked replenishment list example: `replenishment + customer-locked | 30*38 red | customer A locked 300 | remainder to stock`.

Custom printed orders contain more information, so the list can show a summary such as `custom printed | 30*38 white | customer A | print A design | 1000 | ship tomorrow`, with full details available after opening the task.

The custom-order detail page should show customer, order number / line number, product name / print content, size, color, handle type, print color, quantity, latest shipping time, fulfillment method, customer notes, production notes, silk-screen photo / finished-goods photo requirements, exception records, and upstream/downstream process quantities.

If the mobile list cannot fit all information cleanly, prioritize scanability in the list and put the full information inside the tapped detail view.

The bag-making mobile task page should show only `published schedule` tasks assigned to the current schedule / current machine, plus cross-day unfinished `continue tasks` for that machine. Draft schedules must not be shown to workers.

If a worker temporarily covers another machine because of leave, rotation, or shift substitution, the current schedule record controls task visibility for that day. The system should not hard-code visibility from the long-term default machine binding.

Bag-making mobile task-detail actions should vary by task type, while keeping V1 simple.

Recommended actions for customer orders / custom printed orders: `start bag-making`, `upload finished-goods photo`, `report completed quantity`, and `report exception`.

Recommended actions for stock replenishment: `start production`, `report completed quantity`, and `report exception`; pure stock replenishment should not require a finished-goods photo by default.

Recommended actions for `replenishment + customer-locked` are the same as stock replenishment; after completion reporting, the system allocates customer-locked quantity first and puts remaining qualified quantity into stock inventory.

When a bag-making worker starts a task, they must tap `start bag-making` / `start production` once. The system records start time, machine, operator, task / order line, and current schedule assignment.

If the worker forgets to tap `start bag-making` / `start production` and directly reports completed quantity at the end, V1 should allow backfilled reporting and must not block completion. The task should be marked `missing normal start record`, with estimated start information inferred from reporting time where needed, and included in data-quality statistics.

After bag-making completion, the system should auto-route by task type without office confirmation for every task: custom printed orders go to `waiting for packing` / `packing can start`; blank stock/common-goods or loose inventory goes to `workshop-reported inventory / loose inventory`; stock replenishment goes into inventory; `replenishment + customer-locked` allocates the locked customer quantity first and puts remaining qualified quantity into stock inventory.

If completed quantity is below planned or ordered quantity, it should not block the machine from moving to the next task. The current task enters quantity-difference / exception pending handling, where office or management handles customer communication, supplemental shipment, allowance, or actual-quantity billing.

If completed quantity is above planned or ordered quantity, the worker should still submit the actual quantity. The system uses overrun thresholds to decide whether it is normal overproduction, gift / non-chargeable quantity, quantity variance, or exception pending handling, but it should not block the worker from moving to the next task.

V1 should allow a bag-making worker to skip the current task and do the next task, but the worker must choose a reason and retain the trace. Suggested fixed reasons: `waiting for material`, `mold change not completed`, `rush job inserted`, `machine issue`, `supervisor arrangement`, and `other`.

After a bag-making worker taps `report exception`, V1 should offer two paths: `report exception and continue` and `report exception and pause for confirmation`. Minor scrap or light material issues can continue; major print problems, size / mold issues, or serious machine issues should pause and wait for production management / office confirmation.

V1 fixed bag-making exception reasons should start with: `printing issue`, `material issue`, `machine issue`, `size / mold issue`, `quantity exception`, `customer / order information unclear`, and `other`.

Bag-making exceptions enter a `production management / office shared exception pool`. Production management primarily handles on-site judgment and action, while office staff records the system result and handles later customer communication, amount impact, statement impact, or after-sales / quality issue routing.

Ordinary bag-making exceptions should not notify the boss by default. Serious exceptions enter `boss review` or management watch. Serious examples include the whole order printed wrong, customer due date likely delayed, estimated loss above configured threshold, or repeated similar issues across multiple orders.

Bag-making exception handling must end in a clear action. Suggested fixed outcomes: `continue production`, `change task sequence`, `wait for material / repair`, `route to quantity-difference handling`, `route to after-sales / quality issue`, and `cancel / void task`.

Custom printed orders must have an uploaded and not-returned / accepted finished-goods photo before office staff can notify the customer to prepare shipment / arrange express or less-than-truckload.

If the finished-goods photo has been returned, is waiting for retake, or is still pending confirmation, the order line should not enter the shared `waiting to notify customer goods are ready / can arrange carrier` pool.

For non-printed customer orders that still need customer finished-goods confirmation, the backend can configure whether the task requires a finished-goods photo. V1 defaults to requiring it only for custom printed orders.

V1 should not require bag-making workers to maintain frequent `pause / resume` actions for normal work.

Normal lunch/rest, short machine stops, roll/material change, and continuing after machine repair should not require the worker to tap pause on mobile.

Bag-making tasks can span multiple days. If the current task is not finished when the worker leaves work, the worker can tap `unfinished today / continue tomorrow` and record that day's qualified completed quantity.

Cross-day orders should split quantity by day, so later statistics for each worker's daily output and each machine's daily capacity are more accurate.

`Today's completed quantity / today's qualified quantity` should be required in `unfinished today / continue tomorrow`, so workers do not need to remember the quantity the next morning.

`Unfinished today / continue tomorrow` should record date, machine, operator, today's qualified quantity, cumulative completed quantity, estimated remaining quantity, and notes. The task status can show `cross-day in progress` or `unfinished, continue tomorrow`.

When production continues the next day, it should continue the same task / order instead of creating a new task. The mobile side should automatically show planned quantity, cumulative completed quantity, and estimated remaining quantity to reduce worker calculation.

When final `report completed quantity` is submitted, the system should default to summing the daily qualified quantities as the task's total completed quantity, while allowing one final correction by the worker / supervisor with a recorded correction reason.

Daily `today completed quantity` records for cross-day tasks should only feed daily output records, cross-day task progress, and worker / machine capacity statistics. They should not immediately increase available inventory.

Inventory, customer-locked allocation, packing, and reconciliation should recognize only final `report completed quantity` or the final confirmed qualified quantity.

If a customer / pickup person takes some goods directly from the machine during a cross-day task, the system should use `machine-side direct outbound / production direct dispatch`. The outbound / fulfillment quantity is linked to that day's output record and the corresponding order / customer, without passing through normal available inventory.

After machine-side direct outbound in a cross-day task, any remaining unshipped quantity from that day's output remains cross-day task progress and should not automatically become normal available inventory.

For cross-day daily quantity edits, the bag-making worker can edit their own submitted quantity for the current day before the task enters the next day or final completion.

After the task enters the next day, is finally completed, or the quantity has been used in inventory / reporting statistics, historical daily quantities can only be edited by the production supervisor or office staff.

Historical daily quantity edits must record before quantity, after quantity, edit reason, operator, and operation time.

Example: planned quantity is `3000`. On day 1, the worker records `today completed 1800`. On day 2, the task shows `completed 1800, estimated remaining 1200`. If day 2 records `today completed 1100`, the system shows cumulative `2900`, still short `100`, so the task can continue to day 3 or be corrected during final confirmation.

Example: replenishment task planned quantity is `3000`. On day 1, the worker records `today completed 1800`; the daily report counts machine output `1800`, but inventory does not increase by `1800`. After final confirmation on day 2 with total completed `3000`, the system puts `3000` into stock inventory or allocates customer-locked quantity first.

Example: cross-day customer order records `today completed 1800` on day 1, and the customer takes `1000` directly beside the machine. The system records daily output `1800`, with `machine-side direct outbound 1000`; the remaining `800` stays as cross-day task progress and does not enter normal available inventory.

Example: on day 1, the worker records `1800` and immediately realizes it should be `1700`; the same worker can edit it that day. If the mistake is found on day 2, the production supervisor or office staff changes it to `1700` with reason `yesterday quantity entry correction`.

Only final confirmation closes the bag-making task and routes it to packing, customer-locked allocation, or stock inventory according to task type.

This supports accurate cross-day daily output, worker daily output, and machine daily capacity statistics without adding frequent pause-operation burden.

Machine breakdown, repair waiting, printing problems, and similar exceptions should still use `report exception` or supervisor / office backend records. V1 should not force workers to maintain detailed downtime duration.

Bag-making reporting should use piece count as the primary submitted quantity because partial bundles and tail quantities are common:

When reporting completed quantity, the current logged-in actual bag-making worker must submit the report. The system automatically records reporter, machine, task / order line, submission time, and current schedule context. Normal workflow must not allow the worker to manually change the operator.

- the primary saved quantity is completed pieces
- the reported bag-making piece count means qualified finished-goods pieces; inventory and fulfillment only recognize qualified finished goods
- defective bags, printing-problem bags, and unresolved problem material must not be counted as available inventory or deliverable quantity
- 1 bundle usually equals 50 bags, but bundle count is only an auxiliary input/display
- the UI may allow direct piece input or `bundle count + loose pieces`, then convert to pieces, for example `2 bundles + 3 pieces = 103 pieces`
- the Ounuo bag-making machine counter is confirmed as a machine action / cycle count, not qualified finished-goods output
- the bag-making machine counter cannot distinguish qualified production quantity by individual order and may include setup, trial bags, defective bags, semi-finished goods, or repeated actions, so V1 should not use machine counter values as the direct basis for per-order reporting
- the reporting form should use `prefill + editable`: prefill from the planned/order quantity, then let the worker confirm or edit the actual completed piece count
- the worker can edit the prefilled value before submitting the actual completed piece count; the system should retain the prefilled value, final submitted value, modified flag, and modification reason/note
- the system should retain quantity source: planned-quantity prefill, bundle/loose-piece conversion, manual input, or manual correction
- to reduce misreporting or lazy default confirmation, the system should retain the prefill source and whether the worker submitted the prefilled value unchanged
- because each task is prefilled from planned/order quantity, the UI should clearly ask the worker to confirm the actual piece count and treat unchanged-default submissions as one spot-check signal
- reports should enter exception/spot-check queues when the prefilled value conflicts with expected tail quantities, or when later packing/outbound/inventory counts show meaningful differences
- the system should track reporting quality by worker and machine, including unchanged-default confirmation rate, always-equals-order rate, later inventory variance rate, and exception rate
- normal in-tolerance quantity edits should not require a reason; shortage, excessive overrun, meaningful prefill variance, or system-flagged exceptions should require a reason/note
- per-order reporting should not require machine-counter photos, because that would add too much workshop friction
- at end of day, each bag-making machine can have one machine-cycle counter snapshot photo, machine daily-report value, cumulative-reading difference, or manually entered counter value
- the daily machine cycle count is not finished-goods quantity and must not directly create inventory, fulfillment quantity, chargeable quantity, payroll piece count, or deductions; it is production telemetry used later to compare against actual qualified reporting, packing counts, inbound quantity, and abnormal loss records to estimate process variance/loss and detect anomalies
- the daily machine counter record should include machine, date/shift, submitter, counter value, photo/evidence, counter reading type, whether the counter was reset, data source, and notes
- each bag-making machine may expose both lifetime cumulative count and daily machine count; this requires per-machine verification, so V1 design should not assume the counter is reset every day

For printed orders:

- after silk-screen setup is adjusted, the silk-screen workshop should take a `print photo` to record print content, color, position, and effect
- after silk-screen printing is completed, the silk-screen workshop submits the actual printed quantity, then the order flows to bag-making
- after bag-making setup is adjusted and a qualified finished sample bag appears, the bag-making worker should take a `finished-goods photo` to record final bag shape, print effect, and finished-goods state
- for the bag-making `finished-goods photo`, photographer, photo time, machine, and order line number should be system-recorded automatically, not manually entered by the worker
- after a bag-making work order is assigned to a machine, only bag-making workers assigned to that machine in the current schedule / shift can see the order in the workshop mobile side
- when a bag-making worker opens the work order / order, operator is automatically filled from the current logged-in account and cannot be manually edited
- for printed orders, the bag-making `finished-goods photo` must be uploaded after `start bag-making` and before customer shipment-preparation notification
- bag-making `finished-goods photo` is managed per order line. If one original order is split into multiple custom printed suborders / lines, each custom printed line must have its own finished-goods photo
- if the finished-goods photo is blurry, attached to the wrong order, or does not show the finished state clearly, office staff / production management can return it for retake. The bag-making side receives a `finished-goods photo retake required` todo, and the system retains old photo, new photo, returner, return reason, and timestamp
- after bag-making setup produces a qualified finished sample and the `finished-goods photo` is uploaded and not returned / accepted, office staff can notify the customer to prepare shipment / arrange express or less-than-truckload, even if the full order is not fully produced or packed yet
- after the finished-goods photo is uploaded and not returned / accepted, the order line should enter a shared `waiting to notify customer goods are ready / can arrange carrier` pool. This is a reminder for office / management to notify the customer manually, not proof that the system has sent a customer message
- after all bags are produced, helper / packing workers pack the bags and count the actual bag quantity
- the factory often has a time gap between all bags being produced and packing/counting being completed, so statuses should distinguish `finished-goods photo available / customer can be notified to prepare shipment`, `bag-making completed`, and `packing completed / quantity counted`
- after office / management manually sends the customer notification and clicks confirmation in ERP, the order can show a lightweight state such as `customer notified to prepare goods / arrange carrier`. This state does not mean `packing completed`, `shipped`, or `handed to express / LTL`
- for printed orders, packing count is the main source of final deliverable quantity
- the printed-order quantity chain is: actual silk-screen printed quantity -> bag-making finished-goods photo / exception record -> actual packing quantity
- bag-making reported quantity should not be the only basis for final deliverable quantity on printed orders that require packing
- for blank stock/common-goods or loose inventory that does not require packing, bag-making reported quantity can be the source for workshop-reported / loose inventory

Quantity tolerance:

- for custom printed orders, quantity risk is often visible at the silk-screen stage, not only after final packing
- the system should record and compare ordered quantity, actual silk-screen printed quantity, and final packed / delivered quantity
- the system should calculate stage differences, such as `silk-screen overprint = actual printed quantity - ordered quantity`, `process loss = actual printed quantity - final packed quantity`, and `final delivery variance = final packed quantity - ordered quantity`
- these numbers help decide whether the current order is abnormal and also help analyze whether a silk-screen machine often overprints and how much loss happens through silk-screen -> bag-making -> packing
- early V1 should focus on data collection and comparative analysis, not using thresholds to punish workers or force approvals too early
- the system should collect comparable data for the same spec, print type, and order quantity across different machines/workers, such as material input, actual printed quantity, final packed quantity, process loss, and final over/under-delivery rate
- this data should later help establish production benchmarks: for the same 1000-piece order, how much material another machine usually needs, how many pieces it prints, and how many qualified finished goods it produces while satisfying the customer quantity without excessive overrun
- early overprint / loss / over-delivery can be marked as observation data or non-blocking risk hints; after enough real data is collected, the factory can set better recommended ranges and management targets
- example: for a 1000-piece order, actual silk-screen quantity of 1015 or 1020 can be enough for bag-making, and final packed quantity of 1005 is usually reasonable
- fixed `extra 50` or `extra 100` should not be the long-term hard rule; for example, 50 extra pieces on a 1000-piece order is too high proportionally
- overrun judgment should use configurable `percentage + absolute cap`, not fixed piece count only
- V1 can expose overprint / over-delivery tolerance as backend configuration and adjust it later based on real production data
- actual silk-screen printed quantity below ordered quantity, or above configured reasonable overprint range, should initially show a risk hint and enter observation data, not become a hard approval or punishment signal
- final packed / delivered quantity below ordered quantity, or above configured reasonable over-delivery range, should enter quantity exception confirmation
- short quantity is abnormal and should not auto-generate replenishment; the office should contact the customer to confirm whether short shipment is accepted
- excessive extra quantity is abnormal

Abnormal quantity handling:

- normal overdelivery within the configured reasonable range can be marked by office staff as `gift / non-chargeable`; the default reason should be `normal production overrun, not charged`, without requiring free-text reason entry every time and without entering the boss review queue
- in-range `gift / non-chargeable` handling should not block shipment, statements, or payment recording; the system retains actual delivered quantity, chargeable quantity, free / non-chargeable quantity, operator, and timestamp
- if overdelivery exceeds the reasonable range and the final handling is free extra shipment / gift / non-chargeable, it should enter the boss review or management watch queue, but this remains a non-blocking alert and must not block shipment, statements, or payment recording
- short quantity: office contacts the customer by phone/WeCom/WeChat; if the customer accepts short shipment, record confirmation and fulfill by actual qualified quantity
- when actual quantity is below ordered quantity, the system first creates `quantity difference pending handling`; it must not automatically change statement amount, create an allowance, or bill by actual quantity
- `quantity difference pending handling` does not block packing completion, but it should block formal outbound, delivery, pickup completion, express / less-than-truckload picked-up confirmation, and statement inclusion until office or management chooses a handling outcome
- `quantity difference pending handling` enters the office shared todo pool, not a named person's task and not boss push by default. If unresolved after 30 minutes, show a red-dot reminder; if shipment / pickup / express pickup is due today, move it to the top; if unresolved after 1 day, move it to follow-up required
- handling permission should be account-configurable. V1 defaults include office staff, production supervisor / management accounts, and owner-mother / management accounts. Packing workers, bag-making workers, and silk-screen workers can submit only actual quantity and reason, not amount handling or customer-confirmation outcome
- `quantity difference pending handling` should be resolved by office or management choosing an outcome: `customer accepts short shipment`, `discount / allowance`, `bill by actual quantity`, `stock supplemental shipment / fill shortage`, `custom small-plate manual supplemental printing`, `wait for remake`, or `other`
- packing workers submit only actual quantity and required exception reason; they are not responsible for choosing customer-communication outcome, amount handling, or remake method
- short quantity should first be split by order type: stock/common-goods short quantity and custom printed short quantity must not share one automatic handling path
- for stock/common-goods short quantity, such as local delivery or self-pickup missing quantity, the usual handling is `stock supplemental shipment / fill shortage`; the supplemental task links to the original order, original delivery / pickup record, and quantity-difference record, and must not create a new sales order or duplicate revenue
- supplemental / fill-shortage cost belongs to the original order or original after-sales / complaint record and must not become new sales revenue. Finished-goods stock consumed by stock/common-goods supplemental shipment is deducted through normal outbound and attributed to the original order's `after-sales / supplemental cost` or `quantity-difference cost`
- when office or management chooses `stock supplemental shipment / fill shortage` from `quantity difference pending handling` or an after-sales / complaint record, the system should automatically create the supplemental shipment task so staff do not confirm supplementation and then forget to create the task manually
- after `stock supplemental shipment / fill shortage` is chosen, the system should reserve exact matching finished-goods inventory, at least matching size, color, handle type, finished-goods style / printed-stock style, and required packing state; it must not automatically recommend substitute colors, substitute sizes, or substitute handle types
- if stock/common-goods supplemental shipment currently lacks enough inventory, the system should create a pending replenishment / pending supplemental shipment task instead of silently converting the shortage into an allowance or closing it
- suggested stock/common-goods supplemental shipment states: `pending preparation -> pending outbound / pending delivery / pending pickup / pending express or LTL -> supplemental shipment completed`
- supplemental / fill-shortage tasks enter the office shared todo pool; same-day supplemental tasks are moved to the top, unresolved tasks older than 1 day move to follow-up required, and high-risk customers, larger amounts, or delivery-impacting cases enter management watch without blocking already confirmed fulfillment by default
- for custom printed orders short quantity caused by silk-screen, bag-making, or packing final count being below ordered quantity, the usual handling is billing by actual qualified delivered quantity or discount / allowance, not supplemental shipment by default
- only in a small number of custom printed cases, such as self-operated online-store customers needing completion, customer refusal to accept short quantity, or management-confirmed must-fill cases, can the factory issue blank stock bags and perform small-plate manual silk-screen before shipment; record this as `custom small-plate manual supplemental printing` / `stock outbound for supplemental printing`, not a normal second production schedule
- when office or management chooses `custom small-plate manual supplemental printing`, the system should automatically create an abnormal supplemental task linked to the original order, original line, quantity-difference record, and blank-stock issue record
- suggested custom small-plate manual supplemental printing states: `pending blank-bag issue -> manual supplemental printing in progress -> pending packing / fulfillment -> supplemental shipment completed`
- blank bags used for `custom small-plate manual supplemental printing` are supplied from the factory's own stock / blank-bag inventory and attributed to the original order's after-sales / supplemental cost; the small plate and manual silk-screen labor are handled by another / associated factory
- V1 cost standards for `custom small-plate manual supplemental printing`: small plate fee 15 CNY per plate; manual printing unit price 0.10 CNY per piece for single-sided content; 0.13 CNY per piece for double-sided same content
- V1 should record the other / associated factory's plate fee and manual printing fee as internal supplemental / after-sales cost on the original order and support monthly summary export; it should not introduce a full accounts-payable, payment approval, or complex processing-factory settlement module yet
- manual printing cost should be calculated by actual qualified supplemental print quantity, while final customer-supplemented quantity remains separately recorded by fulfillment. Example: if 25 pieces are qualified after supplemental printing and 20 pieces are finally shipped to the customer, printing cost is based on 25 pieces and fulfillment records 20 pieces
- the 0.10 CNY single-sided and 0.13 CNY double-sided same-content unit costs should be auto-filled from the original order's print side / print content, with office override allowed for special cases; the system records before value, after value, operator, timestamp, and reason
- the system should store a cost snapshot for `custom small-plate manual supplemental printing`: blank-bag SKU / size / color / handle type, issued quantity, blank-bag cost, actual qualified supplemental print quantity, final supplemental shipped quantity, plate fee, print-side / content type, manual print unit cost, associated factory, linked original order / line, operator, and timestamp. This cost supports internal costing, responsibility tracing, and gross-margin analysis, and does not automatically create new customer receivables
- later changes to plate fee or manual supplemental printing unit cost affect only newly created supplemental-printing tasks; historical tasks are costed from their stored snapshots and must not be overwritten by later price changes
- if the customer agrees to pay extra for supplemental printing / shipment, record it as an `extra payment adjustment` on the original order linked to the quantity-difference / after-sales record and supplemental task, not as a normal new sales order
- bags used for `custom small-plate manual supplemental printing` must exactly match the original order's size, color, and handle type
- the system should validate stock against the original order's size, color, and handle type, and should not automatically recommend substitute size, color, or handle type
- if no exact matching blank stock exists, `custom small-plate manual supplemental printing` / `stock outbound for supplemental printing` is not available; the office should return to customer negotiation for short shipment / price reduction, or rarely a remake
- special models usually do not have stock/common-goods inventory, so they should default to not eligible for `stock outbound for supplemental printing`
- large-area full-coverage printing is not suitable for manual small-plate silk-screen supplemental printing, so it should default to not eligible for `stock outbound for supplemental printing`
- `stock outbound for supplemental printing` should create an inventory outbound record linked to the original order and abnormal reason, retaining issued size, color, handle type, quantity, supplemental print content, operator, timestamp, and notes
- manually supplemental printed quantity becomes an `abnormal supplemental batch` under the original order. It must not create a new sales order or duplicate revenue
- the `abnormal supplemental batch` needs its own packing / delivery record, deducts inventory by the actual supplemental quantity, and links back to the original order for statements, customer disputes, and responsibility tracing
- only rare cases should create an `abnormal remake task`, manually created by office/supervisor; the system should not auto-generate a normal production order or automatically insert it into the normal scheduling queue
- `abnormal remake task` scheduling, machine assignment, priority, and timing are manually arranged by office / supervisor and do not participate in ordinary automatic scheduling
- after the handling result is confirmed, such as customer accepts short shipment, discount / allowance, bill by actual quantity, stock supplemental shipment / fill shortage, custom small-plate manual supplemental printing, or wait for remake, the system can release later fulfillment. If outbound notes, delivery notes, pickup records, or express / less-than-truckload labels were already printed, the old documents / labels must be voided and reprinted according to the final handling result
- if the customer later confirms supplemental shipment / filling shortage is no longer needed, office staff can cancel the supplemental task; the system releases reserved inventory and records cancellation reason, customer confirmation method, operator, and timestamp
- supplemental shipment completion should not require the customer to confirm again. Normal delivery, pickup, express / less-than-truckload evidence is enough. Only high-risk customers, dispute-prone customers, or high-risk evidence-rule matches require extra notes, screenshots, or attachments
- excessive overrun: management contacts the customer to confirm whether extra pieces are accepted and whether extra payment is required
- in self-operated online-store scenarios, the office may call some customers to request extra payment for excessive overrun, but many customers will not pay; the system should record outcomes such as `customer paid extra`, `customer refused extra payment`, `free extra shipment`, or `ship ordered quantity only`
- quantity differences should first enter `responsibility clues`, not automatic punishment or payroll deduction; only after verification clearly identifies a silk-screen, bag-making, packing, outbound, delivery, or express / less-than-truckload handoff issue should they enter later performance / responsibility confirmation
- V1 responsibility-source options for quantity differences should be fixed values: `production short-made`, `packing under-packed`, `outbound under-shipped`, `delivery / express or LTL lost`, `customer feedback pending verification`, `inventory record error`, and `other`. These are only responsibility clues, not automatic punishment conclusions
- V1 must not automatically deduct employee pay. The system records responsibility clues, reference loss, and handling history only; whether to deduct payroll and the deduction amount must be manually confirmed by an account with management / performance-confirmation permission
- V1 responsibility records should support `responsible stage + optional responsible person + notes`. If the responsible person is known, record the person; otherwise record only the stage and investigation notes. Example: if the customer reports 100 pieces short, first record `outbound under-shipped`; after investigation proves under-packing, add the packing worker as responsible person
- one issue can be linked to multiple responsible people. V1 supports multiple responsible-person records, but responsibility ratio / allocated amount is optional; if payroll deduction is needed, management enters each person's deduction amount manually
- payroll deduction amount is manually entered in V1, while the system provides only reference loss. Reference loss can come from supplemental shipment cost, allowance amount, scrap cost, customer compensation, extra plate cost, or manual supplemental printing cost
- employee mobile V1 should not show single real-time deduction popups or deduction notices. Confirmed deduction summaries can be shown later in the payroll / performance module. Responsibility confirmation and deduction confirmation must not block order flow, outbound, or statements
- customer communication for these exceptions is usually handled by management, currently the owner's mother and sister-in-law, who may not use computers
- V1 should allow office clerks to proxy-enter the customer confirmation and handling reason instead of requiring management to operate the system directly
- V1 customer confirmation method should use fixed options: `phone confirmed`, `WeChat confirmed`, `Enterprise WeChat confirmed`, `on-site confirmed`, `management confirmed`, and `other`. Screenshots / attachments are optional by default and required only when high-risk evidence rules are triggered
- abnormal quantity confirmation should retain customer contact person, contact method, confirmation time, actual management confirmer/contact person, customer response, final handling outcome, whether amount is affected, discount/extra payment amount, whether stock supplemental printing was used, system entry operator, entry timestamp, and notes
- price reduction should not overwrite the original order price or price snapshot; create an `abnormal discount/allowance record` linked to the original order and abnormal confirmation
- V1 should not require mandatory approval for abnormal discounts/allowances
- abnormal discounts/allowances exceeding configurable amount or percentage thresholds should enter a `boss review queue`
- V1 default threshold: discount/allowance amount over 100 CNY, or discount/allowance percentage over 5%; either condition triggers the `boss review queue`
- the `boss review queue` is a non-blocking alert, not an approval gate; V1 should not change the order state or hold the order in pending approval
- the `boss review queue` should not automatically block production, fulfillment, statement generation, or payment recording; if upgraded to formal approval later, it should preferably affect final finance confirmation first rather than workshop production or customer delivery

## Scrap And Loss

The factory does not currently have a mature scrap procedure. V1 should not introduce formal scrap documents, scrap approval, or complex cost accounting.

Routine bag-making waste is currently bagged and sold as scrap directly. There is no dedicated role that handles per-order scrap processing. V1 should not require workshop, office, or warehouse staff to run a formal scrap workflow for every ordinary waste batch.

Routine bag-making waste can either remain unrecorded at per-order level or be captured as a lightweight `scrap-bag / waste batch` record. If recorded, fields can stay minimal: date, optional source workshop / machine, estimated weight or bag count, handler, scrap-sale amount, optional buyer, and notes.

Scrap-sale records should not be treated as customer order revenue, should not enter customer statements, and should not change qualified finished-goods inventory. Later, they may be reported separately as other income / material recovery reference data.

Only problem goods that affect customer orders, inventory, amount handling, quality complaints, or responsibility judgment should enter `pending handling / pending scrap` or abnormal loss flows.

V1 should only capture lightweight `abnormal loss records` so real operational issues can be collected first.

- normal reporting should not require scrap/loss entry; workers submit actual finished-good pieces only
- abnormal loss records are required only for exceptions such as shortage, excessive overrun, wrong color/size/handle, machine fault, obvious defective bags, printing problems, or meaningful differences found during packing/outbound/inventory counts
- defective bags, problem bags, and unresolved problem material must not enter available inventory; if temporarily retained, they should enter `pending handling / pending scrap` and cannot be outbounded or included in customer statements
- office staff and the production supervisor can initiate pending handling / pending scrap records; production supervisor or management confirmation makes the result effective, and V1 does not require boss approval
- V1 abnormal loss reasons should use fixed mobile-friendly options: shortage, excessive overrun, wrong size/color, wrong handle/strap, machine fault, obvious defective bags, printing problem, quantity mismatch, and other
- defective bags found during bag-making are not always caused by bag-making; printing content, position, color, ghosting/double image, missing print, dirty screen, or similar issues should be marked as `upstream silk-screen issue` so they are not incorrectly attributed to the bag-making worker or machine
- `printing problem` can use sub-reasons: wrong print content, position offset, wrong color/color variance, ghosting/blurred print, missing print, dirty screen/stain, and other
- when a bag-making worker finds a printing problem, the flow should be `report exception + choose continue or pause`
- the current shop-floor habit is to stop the machine, find the production supervisor, and continue only after confirmation; therefore V1 should default to `pause for supervisor confirmation` and set the task/order to `exception paused`
- after supervisor confirmation, allowed outcomes should include continue production, skip bad material and continue, partially complete, return to silk-screen review, or hand off to office
- V1 should allow the bag-making worker to proxy-record supervisor confirmation by selecting `supervisor confirmed` and choosing/entering the supervisor name; the system should retain proxy recorder and confirmation timestamp
- later versions can add production-supervisor self-confirmation from mobile or the large screen
- the system should not automatically return the order to silk-screen because that could interrupt production incorrectly; return/continue must be confirmed by the supervisor or office
- suggested abnormal loss fields: order/task, discovery step, responsible/source step, machine, worker, timestamp, exception type, estimated lost pieces or weight, whether delivery is affected, supervisor confirmation method, supervisor name, proxy recorder, confirmation timestamp, optional photo, and note
- abnormal loss records should not directly affect finished-goods inventory; inventory moves only through actual qualified finished-goods reporting, inbound, and outbound
- defective quantities belong only to abnormal loss records or process variance reporting; they must not participate in inventory, fulfillment, or statement deliverable quantity
- responsibility clues should be generated only for issues that affect customers, amount handling, inventory, or performance judgment, such as wrong shipment, short shipment, printing error, bag-making error, packing error, customer complaint, or major inventory variance
- responsibility clues should record responsible stage, possible responsible person, machine, order, quantity, reference loss, reason, and handling outcome. The responsible person can be filled later, and the shop floor should not be forced to assign responsibility immediately
- photos are optional for ordinary exceptions. Customer complaints, compensation / allowance, whole-order scrap, repeated same-type issues, or estimated loss above 300 CNY should require photos, notes, or other evidence
- the Ounuo bag-making machine's built-in counter / daily report is a machine action or cycle count, not qualified finished-goods output. ERP fields and UI should label it as `machine count`, `cycle count`, or process telemetry rather than finished quantity
- the difference between daily machine cycle count and actual reported/inbound quantity should be called `process variance`, not automatic scrap quantity, because it may include setup/testing, semi-finished goods, tail quantities, counter error, repeated actions, or delayed reporting
- V1 should reserve optional daily machine-counter reading fields. These readings do not affect inventory, fulfillment, chargeable quantity, payroll, or deductions; they are only used later to compare qualified reporting, packing counts, inbound records, and abnormal loss records
- if a future machine exposes a reliable cycle-to-piece multiplier, the derived value should be marked as a theoretical estimate and still must not replace qualified reporting, packing counts, inventory inbound, delivered quantity, or chargeable quantity
- quantity differences should resolve into fixed outcomes: customer accepts actual quantity, allowance / amount adjustment, supplemental shipment / supplemental printing, pending handling / pending scrap, inventory correction, or responsibility record. This keeps orders from staying indefinitely in an abnormal state
- later reports can aggregate process variance and abnormal loss by machine, size, color, worker, order type, discovery step, and responsible/source step to support a future formal scrap/loss process

## Finished Goods Inbound And Counting

Finished-goods inbound counting should be scenario-based. The system should not require office or outbound staff to manually count every finished-goods inbound transaction because those roles are already busy.

For custom printed orders and printed stock/common-goods styles, packing is usually required. Packing workers can count while packing, and package quantities can become the final confirmed quantity.

For printed orders, packing count is the main basis for final deliverable quantity and statement delivered quantity.

Packing must record package details, not just a completed flag. The mobile packing flow should capture package count, quantity per package, weight only when required, and customer/order notes. Weight is required only when a customer, current order, transfer warehouse, ocean-shipping rule, express / less-than-truckload rule, or office instruction requires it.

Packing tasks should appear only when packing is actually needed. Custom printed orders and printed stock/common-goods styles usually enter packing. Blank stock/common-goods orders enter packing only when the order requires packing, the fulfillment method is express / less-than-truckload, customer notes require it, office staff specifies it, or later fulfillment needs package records.

For printed orders that require packing, after bag-making uploads the `finished-goods photo`, the order can enter `packing can start` and appear on helper / packing workers' mobile side.

`Packing can start` is a task state, not a required extra `start packing` action. In V1, the main packing-worker action is entering / confirming package details and submitting `packing completed`; submission means the goods have been packed and counted.

Packing workers can start packing while bag-making is still producing the rest of the order.

`Packing can start` does not mean `packing completed` and does not mean final quantity has been counted.

One order line can have multiple packing batches, supporting packing while production is still running.

For example, if bag-making first produces 500 pieces, the packing worker can create `1 package x 500`; when another 510 pieces are produced, the worker can add a second package of `510`. The system should sum all packing batches into final package count and final delivered quantity.

Before clicking `packing completed`, bag-making must have finished or the current deliverable production batch must be confirmed complete, and packing workers must enter complete package details and final actual bag quantity.

After packing completion, package-detail total quantity becomes the main basis for printed-order final deliverable quantity and statement delivered quantity.

Order records should keep `original ordered quantity`, `actual packed quantity`, `actual delivered quantity`, `chargeable quantity`, `free / non-chargeable quantity`, and `variance reason` separately. Inventory, fulfillment, and responsibility tracing use actual quantities; statement amounts use chargeable quantity and adjustment records.

Custom printed orders should retain silk-screen reported quantity, bag-making reported quantity, and actual packed quantity so later reports can analyze overprinting, bag-making loss, and packing variance.

Example: the customer orders `1,000`, silk-screen reports `1,020`, bag-making qualified output is `1,008`, and final packed / delivered quantity is `1,005`. Inventory and delivery records use `1,005`. If the customer pays for only `1,000`, the statement shows total delivered quantity `1,005`, chargeable quantity `1,000`, free / non-chargeable quantity `5`, and a note such as `5 extra pieces not charged`.

Example: the customer orders `1,000`, but final packed quantity is `980`. The packing worker submits actual `980`; the system warns that it is below ordered quantity and requires an exception reason / note, but it must not block packing completion. Office or management then handles customer communication, allowance, supplemental shipment, or actual-quantity billing.

The system should support default packing plans. Priority should be explicit order/customer notes first, then customer-profile packing preference or historical packing experience, then system default rules.

If the customer has no special requirement and no historical special requirement, a default such as `1000 pieces / package` can be used.

Historical packing experience is only a prefill suggestion, not a forced rule. For example, if a customer usually uses `500 pieces / package`, the system can prefill or hint `500 pieces / package`; if the current order says `1000 pieces / package` or office staff changes it, the current-order requirement wins.

The packing page should show `customer notes`, `office notes`, customer-profile default packing preference / historical packing experience, and current-order packing requirement. Priority is current-order explicit requirement > customer/office notes > customer default/history suggestion > system default.

After customer shipment-preparation notification, a customer may call to add or change packing requirements, such as changing from default `1000 pieces / package` to `500 pieces / package`.

If packing has not started, update the order's packing requirement and pending packing plan directly.

If goods are already packed but not yet delivered, picked up, or taken by express / less-than-truckload, V1 should allow a `repack / change packing` operation, retaining customer request, original package details, new package details, operator, timestamp, and notes.

`Repack / change packing` should void the old package details and create new package details. If express / less-than-truckload labels have already been printed, the old labels must also be voided and reprinted from the new package details.

Before express / less-than-truckload label printing, authorized accounts may edit package details. After label printing, changes to package count, quantity per package, package sequence, or key fields must go through label voiding / reprinting. After goods have been delivered, picked up, or taken by express / less-than-truckload, packing workers cannot edit historical package details; office staff can only record an exception or after-sales / customer complaint record.

If goods have already been delivered or picked up by express / less-than-truckload, record the late customer request and why packing cannot be changed; do not silently edit historical package details.

Packing exceptions should enter the office shared pool. Packing workers should not directly change orders, amounts, or labels. Suggested V1 fixed reasons are `insufficient quantity`, `customer changed packing method`, `package damaged`, `weighing required`, `label issue`, and `other`.

When packing workers submit an exception, they only describe the on-site issue and actual package / quantity situation. Office staff or authorized accounts handle customer contact, order / packing-requirement changes, label voiding / reprinting, quantity-difference routing, or after-sales / complaint routing.

For blank stock/common-goods bags, many batches are not packed. Requiring packing/counting before inventory would be too heavy. V1 should allow the bag-making worker to report completion quantity from the workshop mobile side.

`Workshop-reported inventory` and `loose stock inventory` should not be treated as two conflicting inventory buckets. They are two dimensions:

- quantity source / confidence: workshop reported, not reviewed
- packaging state: loose, unpacked

For bag-making, the workshop-reported quantity should be the final piece count. Inbound confirmation can also show auxiliary bundle/loose-piece details, machine, operator, and timestamp.

Inbound and available inventory should increase only by qualified finished-goods quantity, never by defective or unresolved problem-material quantity.

This inventory can participate in inventory search and replenishment decisions, but the UI must clearly label it as `workshop-reported / loose / unreviewed` so it is not confused with counted warehouse inventory. It must retain source metadata:

- machine
- operator
- timestamp
- reported quantity

Differences found during outbound, spot count, or inventory count should be recorded as inventory adjustments with reasons.

V1 should not make outbound staff the mandatory confirmer for every blank stock inbound. Add exception-based review instead: out-of-tolerance quantity, shortage, new spec, new worker, urgent key-customer order, etc.

Blank stock `workshop-reported inventory` may be outbound directly. During busy seasons, customers or pickup staff may wait beside the bag-making machine, and goods may be loaded immediately after production.

The target process is to train customers to place orders in WeChat / Enterprise WeChat groups in advance, office staff enter the order, and warehouse outbound staff prepare goods, perform outbound, and confirm the actual taken quantity.

Warehouse outbound staff should be the default priority role for formal outbound confirmation.

Old customers directly entering the bag-making workshop, taking goods themselves, and reporting quantity later should be kept as a transition-period exception in V1, not the main process.

This should be modeled as a `machine-side direct outbound` or `production direct dispatch` flow:

- create the production completion report
- create the outbound / fulfillment record
- link both to the order
- record machine, reporting operator, outbound confirmer, actual outbound quantity, fulfillment method, and timestamp
- it must link to a customer and a formal order / order line; if the customer arrives before an ERP order exists, office staff should first create a quick stock/common-goods order, then complete machine-side direct outbound
- bag-making workers mainly record production quantity and are not the default final confirmer for how many pieces the customer actually took
- machine-side direct outbound should preferably be confirmed by warehouse outbound staff; if they are not on site, the production supervisor or office staff can proxy-enter it and mark `pending warehouse review`
- customer self-reported quantity is only a reference record and must not directly become final inventory deduction unless warehouse / office confirms it
- machine-side direct outbound should still create an outbound / pickup / fulfillment record. If there is no time to print on site, staff can confirm electronically first, and office staff can later back-print or link the paper document, marked as `back-printed / linked later`
- the shortcut flow should stay short: select customer / order, enter taken quantity, choose `machine-side pickup / machine-side direct dispatch`, and complete. Notes, paper document handling, and review can be backfilled
- after confirmation, the direct outbound quantity should immediately offset that day's workshop-reported / machine-side output. If final production inbound has not happened yet, the system should record the offset link and subtract already dispatched quantities when the task is finally completed
- the system should provide a same-day `machine-side direct outbound pending review` list so warehouse / office staff can review it. Unreviewed items after the day ends get a red-dot reminder, and items older than one day enter follow-up
- for cross-day tasks, allow machine-side direct outbound before final `report completed quantity`, but link the outbound quantity to that day's output record and the corresponding order / customer
- when the cross-day task is finally completed, subtract quantities already dispatched machine-side before moving the remaining qualified quantity to packing, customer-locked allocation, or stock inventory, so the same pieces are not inbounded or delivered twice
- if actual loaded quantity differs from workshop-reported quantity, create an inventory difference or quantity correction record
- review variances should use inventory adjustment / cycle-count correction. If the variance can be linked to an order, machine, operator, or outbound confirmer, the system may create a responsibility clue, but it must not auto-deduct pay
- inventory movement should show workshop/machine as the source even if no warehouse location is used
- `workshop-reported / loose / unreviewed` inventory can participate in lookup, but before office staff promises a customer, creates a formal reservation, or completes outbound, the UI must show the lower-trust source and recheck availability

Example: customer takes `1000` pieces beside the machine. The bag-making worker records today's production as `1800`, warehouse outbound staff confirms the customer actually took `1000`, and the system deducts outbound `1000`; the remaining `800` still follows cross-day task progress or final reporting.

Example: customer says `I took 1000`, but nobody confirmed it on site. The system records `customer self-reported 1000, pending review` and does not directly deduct inventory.

This is not a conflict: blank stock can first become workshop-reported loose available inventory, then outbound/fulfillment confirms the actual quantity. Any difference becomes an adjustment record.

## Packing Requirements

Packing must record package details:

- package count
- quantity in each package
- optional weight per package
- package/customer notes

The sum of package quantities should reconcile against reported finished quantity.

Internally, packing quantities should remain traceable by `order line number`.

Shop-floor operation may merge packing for multiple order lines when they belong to the same customer, same fulfillment method, and same address or pickup batch.

Merged packing records must still allocate quantities back to each `order line number`, so reconciliation and traceability remain clear.

## Fulfillment Requirements

Delivery:

- delivery note
- driver task
- watermarked photo at specified location required before completion
- warehouse picks and packs according to the order
- warehouse hands goods and outbound/delivery note to the driver
- driver checks goods against the note before loading
- driver delivers to the specified location
- driver gets receiver signature on the paper duplicate note when the customer cooperates
- driver brings back one copy of the duplicate paper note

V1 should support system-generated electronic delivery / outbound notes and printing, while allowing continued use of existing duplicate paper notes during transition.

The system must store an electronic note number, order lines, package / quantity details, and fulfillment information. The paper duplicate-note number can be entered manually or generated automatically when printing from the system.

Paper duplicate notes and electronic delivery / outbound notes should be linked so the office can later find returned notes, delivery photos, and statement evidence.

Pickup:

- outbound note
- after packing/outbound, create a pickup note
- warehouse or office checks goods against the pickup note when the customer arrives
- pickup person signs the paper outbound note in the normal flow
- signature means this batch was picked up; it does not mean the pickup person verified complex order-line details
- signature is useful, but V1 should not block completion when the customer refuses to sign
- if signed, record signature state or photo
- if not signed, upload a handoff photo or record that the customer picked up the goods, with pickup person, pickup time, and notes
- pickup completion becomes delivered and can be used as statement evidence

Delivery notes, outbound notes, and pickup records may include multiple order lines when customer, fulfillment method, and address / pickup batch match.

Merged fulfillment should not change independent order-line flow or statement line rules. One delivery note may complete multiple order lines, but customer statements still show rows by `order line number` / style / print content.

Formal outbound / pickup flow should stay short:

1. Customer or third-party pickup person goes to the office and provides customer name / order.
2. Office staff confirms the order and manually prints a two-copy outbound note from the outbound task when needed.
3. The outbound note syncs to the outbound worker mobile `pending picking / outbound task pool`.
4. The outbound worker picks goods according to the mobile task / paper note and verifies product and quantity.
5. The pickup person loads goods and signs the paper outbound note.
6. The outbound worker taps `complete outbound` on mobile.
7. The customer keeps one copy and the factory keeps one copy.

V1 can add lightweight preparation states under `waiting for outbound`, to gradually move from finding goods only when the customer arrives toward preparing goods in advance:

- `pending preparation`: office staff or an account with permission marks the outbound task as needing advance preparation.
- `prepared`: the outbound worker finds the goods in advance, places them in a temporary preparation area, and confirms preparation.

`Pending preparation` / `prepared` does not mean outbound is complete. It does not deduct actual inventory or count as delivered / reconciled quantity; inventory remains reserved.

Goods in the waiting express / less-than-truckload pickup area follow the same rule: they are reserved / locked, but not actually outbound, not deducted from inventory, and not included in statements until the `picked up` confirmation.

After `prepared`, self-pickup still needs the customer to pick up goods and staff to tap `complete outbound`; delivery still needs goods and documents handed to the driver and the matching handoff / outbound action; express / less-than-truckload still needs the `picked up` confirmation.

Preparation records should store preparer, preparation time, temporary preparation area/location, prepared quantity, and notes.

V1/V1.5 can support QR/barcode goods cards first for `prepared` goods, waiting express / less-than-truckload pickup areas, delivery handoff, and pickup handoff. The system should not require a separate code on every single bag.

QR/barcodes should be attached to goods cards, packages, pallets, baskets, or temporary preparation-area labels, and should identify the batch of goods, package, or outbound task.

Goods cards must include both human-readable information and a QR/barcode. Even if the scanner, phone, or system is temporarily unavailable, workers should still be able to read customer name, order tail number, fulfillment method, size/color/quantity, package count / piece count, customer notes, and office notes.

The QR/barcode content should preferably store only an internal system ID, such as preparation task ID, outbound note number, package ID, or raw-material batch / roll number. It should not encode all business details directly, because those details may change after the label is printed.

V1 QR/barcode goods-card printing should follow document-printing permissions. Office staff or accounts with print permission should manually print/reprint labels from the outbound note, pending-preparation task, or waiting express / less-than-truckload pickup list.

Warehouse / outbound workers in V1 are responsible for attaching labels, scanning, checking, and using goods cards. They should not have label-printing permission by default; warehouse label-printer permission can be opened later after the on-site process is stable.

During outbound, scanning with a scanner or phone should open or validate the corresponding outbound task / package and warn whether it belongs to the current customer / document, reducing wrong-goods and missing-goods mistakes.

Scanning is only an auxiliary check. V1 should not require scanning for every outbound action, so missing scanners, damaged labels, or busy on-site conditions do not block fulfillment.

If the customer changes quantity, changes fulfillment method, or cancels after goods are prepared, the system should prompt staff to handle the physical goods: keep holding, return to warehouse/location, change quantity, or move to another task.

Entering `waiting for outbound` does not mean the outbound note has already been printed. Outbound tasks should show `not printed / printed / voided / reprinted` status to avoid premature printing, duplicate printing, or paper notes becoming inconsistent after customer quantity / fulfillment changes.

After an outbound note, delivery note, or pickup record has been printed, if order quantity, actual outbound quantity, fulfillment method, price, customer information, or key notes change, the old note must be voided. The system must generate a revised electronic note and print a new paper note.

The old paper note must not be hand-edited and reused as the formal fulfillment or statement basis. The system should keep the voided note for traceability.

Voiding old notes, generating revised notes, and reprinting new formal notes can only be done by office staff or accounts with document-printing permission. Outbound workers, drivers, and workshop accounts must not directly void or reprint formal notes.

If outbound workers discover an issue on site, they submit `quantity mismatch` / `unable to outbound`, or contact the office in person or by phone. After the office confirms the handling result, the office voids the old note and reprints the new note in the system.

The high-frequency scenario for quantity mismatch, order change, and revised document printing is factory self-pickup. After the customer's stock order is entered, warehouse picking may find insufficient goods. The outbound worker then contacts the office in person or by phone. The office negotiates with the customer to change quantity, wait for replenishment, or cancel the shortage. If the customer accepts a changed quantity, the office changes the order and reprints the note.

After a factory self-pickup quantity mismatch, if the customer accepts the changed quantity, V1 should not require photo or signature evidence by default. During exception handling, the office must choose a customer confirmation method: `confirmed verbally on site`, `confirmed by phone`, `confirmed by WeChat`, or `other`, and the system records confirmer / operator and confirmation time.

For high-value cases, dispute-prone customers, large variance ratios, or cases where office staff expect later dispute risk, the system should require an additional note and optionally an uploaded WeChat screenshot, phone note, or other evidence. These records support internal traceability and statement explanation, but should not block ordinary small self-pickup quantity changes.

High-risk evidence triggers should be configurable, not hard-coded. V1 defaults can be: amount difference above `100 RMB`, quantity variance above `20%`, customer marked as dispute-prone, or office staff manually checking `stronger evidence required`. If any trigger matches, the system requires a note and optionally screenshot / attachment.

Example: customer ordered `500 pcs`, actual quantity is `430 pcs`, unit price is `0.36 RMB`, and the amount difference is `25.2 RMB`. For an ordinary customer, office staff only chooses `confirmed verbally on site` and the system records time / operator. If the customer ordered `5000 pcs` and actual quantity is short by `800 pcs`, or the amount difference reaches several hundred RMB, the system requires a note or WeChat screenshot.

Delivery orders should usually be prepared as packed goods plus the matching document before driver handoff. The driver receives packed goods + document, checks the handoff, and delivers. The driver should not change the order, quantity, or document on site.

If a delivery order has a goods/package quantity mismatch before driver loading, it should return to warehouse / office handling before the truck leaves. The driver should not leave with mismatched goods and document. The office then voids the old note, changes the order if needed, and reprints the new note according to the confirmed result.

Reprint history should store old note number, new note number, key before/after differences such as quantity / amount / fulfillment method, void reason, operator, operation time, and print count.

The outbound worker mobile task pool should be compact, grouped by status, and show each task in two lines:

- line 1: `[fulfillment method] customer name #tail number`
- line 2: `item summary / multi-item summary + necessary flags`

Examples:

- `[pickup] Zhang San #001` / `30*38 red 500 pcs`
- `[delivery] Li Si #002` / `3 items / 1200 pcs urgent`
- `[LTL] Wang Wu #003` / `2 packages / 800 pcs`

The outbound worker mobile task pool should be grouped by status. Default groups are `waiting pick / outbound`, `prepared goods`, `quantity mismatch`, and `unable to outbound`.

List sorting should prioritize `ships / pickup due today`, `urgent`, and latest needed time, then task creation time. This reduces the risk of missing same-day shipments or pickups.

The list page does not need to show warehouse/location, to keep the task list dense and readable.

The detail page header should show customer name, fulfillment method, contact / phone, customer notes, office notes, and latest needed time. The detail page should also show full outbound note number, all lines, recommended warehouse zone / location, inventory source, customer notes, and office notes.

Each outbound detail line should show size, color, handle type, finished-goods style, expected outbound quantity, prepared / outbound quantity, recommended warehouse zone / location, and inventory source.

Recommended warehouse zone / location is only a picking aid, not a forced outbound source. If staff actually pick from another location, outbound completion should record the actual location, quantity, operator, and time.

When outbound staff taps `complete outbound`, actual location should not be required in V1. The system can default to the recommended warehouse zone / location, and staff can change it to the actual location. If the site is busy or locations are not cleaned up yet, they can choose `not recorded`, `pending cleanup`, or `temporary location`.

Missing actual location should not block outbound completion, but the system should retain the field and status for later stocktaking, location cleanup, and inventory-accuracy analysis.

Inventory source on the detail page should distinguish counted warehouse inventory, workshop-reported / loose / unreviewed inventory, prepared temporary location, waiting-pickup area, waiting express / less-than-truckload area, and similar sources, so outbound staff can judge reliability.

Inventory source / status marks should include `warehouse-counted`, `workshop-reported / loose`, `waiting-pickup locked`, and `pending handling`. `Pending handling` inventory must not be used for normal outbound until office staff or a permitted account resolves it.

`Customer notes` come from the customer's order or follow-up request, such as packing requirements, delivery requirements, or color/size reminders.

`Office notes` are internal-only notes for office additions, temporary communication, operational reminders, or information the customer did not explicitly state but the office wants outbound/delivery staff to notice.

V1 office notes can start as free text. Later, the system should analyze frequently entered note text and turn common patterns into preset options / quick phrases to reduce office entry time.

Warehouse/location fields should be reserved because they will be useful after future inventory cleanup, stocktaking, and fixed-location management.

Because the current warehouse/location situation is messy, V1 should allow location to be blank, pending cleanup, or temporary. Missing location should not block outbound, but should remain visible as an inventory cleanup / stocktaking improvement item.

Outbound notes, delivery notes, and pickup records should show unit price and total amount, because some customers reconcile immediately after returning and transfer payment directly.

V1 does not need a price-hidden handoff copy. Both copies of outbound notes, delivery notes, and pickup records should show price by default.

Local / same-village customers and third-party outsourced printing partners generally know the factory prices, and delivery drivers are internal factory employees, so V1 does not need to hide unit price or total amount from drivers or local third-party pickup people.

Factory prices follow unified price tables. A quantity difference such as 10 pieces versus 10,000 pieces does not automatically mean a different unit price or require hiding the price.

Prices shown on these notes must use the order's saved price snapshot, so later price-table changes do not affect already generated or printed outbound / fulfillment notes.

Outbound note, delivery note, and pickup record amounts are normally calculated from this note's actual outbound / delivered quantity, not the original ordered quantity. If free / non-chargeable quantity exists, the amount is calculated from this note's chargeable quantity.

If the current actual delivered quantity is higher than the original chargeable quantity and office staff confirms the extra pieces are normal overrun / gift / non-chargeable quantity, the note and statement amount should use `chargeable quantity` while showing or noting actual delivered quantity and free / non-chargeable quantity. Example: ordered `1,000`, delivered `1,005`, charged `1,000`; amount uses `1,000`, with note `5 extra pieces not charged`.

For stock/common-goods supplemental shipment / filling shortage after short shipment, the supplemental outbound / delivery / pickup note should show product, size, color, handle type, quantity, and fulfillment method, but amount should be `0`, or notes should clearly say `original order supplemental shipment, not charged again`.

Abnormal supplemental batches, after-sales supplemental shipment, exchange fulfillment, and similar non-new-revenue fulfillment notes should clearly show `not charged again` or `original order / after-sales supplemental shipment`, so customers and office staff do not treat the supplemental fulfillment as a new sale.

Original ordered quantity should remain in order details and internal traceability. If needed for customer explanation, it may appear in note remarks or details, but it must not affect the current note amount.

If office staff confirms that the customer accepts the actual quantity after a `quantity mismatch`, for example a factory self-pickup order was originally `500 pcs` but actual outbound is `430 pcs`, the system must generate and print a new pickup / outbound note for `430 pcs`. The original `500 pcs` note is marked voided and must not be used for customer signature, statement, or payment collection. If the same type of change happens before delivery loading, the delivery note is also reprinted before handoff to the driver.

The revised self-pickup note, order exception record, and inventory ledger should link to the same customer-confirmation record, so later statements or complaints can show original quantity, actual quantity, confirmation method, confirmation time, operator, and notes / attachments.

Each line should show at least product / print content, size, color, handle type, quantity, combined unit price, and line amount. The note footer should show the current outbound / fulfillment amount total.

Handle type should show the actual order-line handle type, such as default / normal handle or extended handle. If the customer did not request extended handle, the line defaults to normal handle for pricing and outbound.

Bag unit price should follow the order price snapshot matched by size, color, and handle type. Extended-handle pricing must not be mixed with normal-handle pricing.

Lines with the same size and color but different handle types must remain separate on outbound notes, delivery notes, and pickup records. Inventory, outbound, and statements should also record them separately by handle type.

Price columns should be chosen dynamically by order-line type instead of using the old fixed template behavior that shows irrelevant fields for every order.

Blank stock / non-print lines should show bag unit price, combined unit price, and line amount. They should not show a print unit price field.

Printed custom lines and printed stock lines should show bag unit price, print unit price, combined unit price, and line amount so customers can reconcile directly.

If one note contains both printed and non-print lines, the system should render applicable price fields per row or group. Non-print line areas should not show a print unit price field.

For split delivery, the note should show this batch's actual outbound / delivered quantity and this batch's amount. The order and statement still retain original ordered quantity, cumulative delivered quantity, cumulative amount, and any undelivered remainder.

For split delivery, short-shipment replenishment, or factory self-pickup where the customer takes part of the quantity first and waits for the remainder, later replenished quantities still belong to the original order / original order line. They should not be priced as a new order.

Later replenishment batches should use the original order price snapshot. Replenishment date, delivery date, or price-table changes during the waiting period must not recalculate price; any real adjustment must use current-order manual override or an exception adjustment record.

Normal one-time fully delivered notes should not show `original ordered quantity / cumulative delivered / remaining undelivered` fields, so the printed note stays simple.

Only split delivery, short shipment, shortage-to-later-fulfillment, and similar cases should show progress fields, for example: `original order 1000, this outbound 600, cumulative outbound 600, remaining 400`.

These progress fields explain delivery state only. They must not affect the current note amount, which is normally calculated from this note's actual outbound / delivered quantity, except when free / non-chargeable quantity exists; in that case, the note amount uses this note's chargeable quantity.

Outbound worker mobile should keep only three primary actions: `complete outbound`, `quantity mismatch`, and `unable to outbound`.

Do not force extra buttons such as `start picking` or `verified`. Tapping `complete outbound` means the outbound worker has checked the goods and quantity and handed over the goods.

On normal `complete outbound`, actual outbound quantity defaults to the task's expected quantity. The outbound worker should not need to re-enter quantity for normal orders.

If actual quantity differs from expected quantity, for example an order asks for `30*38 red 500 pcs` but staff only finds `430 pcs`, the outbound worker must not directly change the quantity to 430 and complete outbound. They must tap `quantity mismatch` and enter the actual found quantity.

When the outbound worker taps `quantity mismatch`, they must not directly edit the order, inventory, or statement quantity.

`Quantity mismatch` should only ask for actual found quantity, variance reason, and a short note, for example `ordered 500, found 430`. Photo upload is optional by default.

V1 fixed reasons for `quantity mismatch` should include: inventory shortage, goods cannot be found, wrong color / size, packing / label issue, and other.

Because the warehouse is close to the office, the current on-site process can continue: outbound worker calls the office for confirmation. The system should still require a `quantity mismatch` record so verbal handling is not lost.

After submission, the order enters office exception handling. Office staff or an account with permission decides whether the customer accepts the actual quantity, staff continues searching, waits for replenishment, cancels, changes quantity, moves to shortage confirmation, or creates an inventory adjustment.

When office staff chooses `customer accepts actual quantity`, the system should require a customer confirmation method. V1 fixed options are `confirmed verbally on site`, `confirmed by phone`, `confirmed by WeChat`, and `other`. Ordinary small cases do not require evidence upload; high-risk cases should require notes or attachments.

High-risk evidence rules should be configurable. V1 defaults can trigger when amount difference is above `100 RMB`, quantity variance is above `20%`, the customer is dispute-prone, or office staff manually checks `stronger evidence required`. A matched trigger does not necessarily require approval, but it does require a note or attachment.

For factory self-pickup quantity shortage, office exception handling should provide three explicit outcomes:

- `customer accepts short shipment, cancel remainder`: for example the customer ordered `500 pcs`, only `430 pcs` are available, and the customer says `430 is fine`. The system ships `430 pcs`, deducts inventory, reprints a new `430 pcs` note, and reconciles `430 pcs`; the remaining `70 pcs` are cancelled and will not be replenished.
- `take actual quantity now, wait for the remainder`: for example the customer takes `430 pcs` now and waits for the remaining `70 pcs`. The order keeps the original `500 pcs`; this outbound / statement batch counts only `430 pcs`, and the remaining `70 pcs` move to waiting for replenishment / waiting for outbound. After replenishment, the system creates the next outbound / pickup note and statement record. The remaining `70 pcs` still belong to the original order and use the original order price snapshot, but enter the statement period by the actual later delivery date.
- `do not pick up now, wait until full quantity is ready`: for example the customer does not want split pickup and waits until all `500 pcs` are ready. The current outbound is not completed, no current outbound quantity is deducted, and nothing enters the statement yet; the order remains waiting for replenishment / waiting for outbound.

When office staff chooses `do not pick up now, wait until full quantity is ready`, the goods already found on site, for example `430 pcs`, should enter `prepared / temporary preparation area`, remain reserved for this customer, and not be released to other orders.

The system should record temporary preparation location, prepared quantity, preparer / operator, preparation time, and notes. After the remaining quantity is replenished, the system can generate / print the final pickup note and complete outbound for the full quantity.

Outbound worker mobile can provide a lightweight `mark prepared goods` action for cases where goods have been found but the customer, driver, or carrier has not picked them up yet. It may ask for temporary location, but V1 should not make that field mandatory.

Prepared goods waiting for full quantity also need reminders: after `1 day`, remind the office to confirm whether to keep holding; after `3 days`, move it into the `follow-up required` list. The system must not automatically release this prepared inventory; release or cancellation requires office confirmation.

All three outcomes must retain original ordered quantity, on-site actual quantity, variance quantity, customer confirmation method, operator, and timestamp, so order details, documents, and statements remain unambiguous.

After choosing `take actual quantity now, wait for the remainder`, the remaining quantity should enter a `remaining quantity waiting for replenishment / outbound` todo. The system should remind staff but must not automatically cancel the remainder.

V1 default reminder rule: remind the office once `1 day` after the remaining quantity is created; if still unresolved after `3 days`, move it into the `follow-up required` list.

Self-pickup remainder todos and prepared-goods follow-ups for full-quantity pickup should share one `office shared todo pool` in V1, not be assigned to a specific person. Office clerks, management / owner-mother accounts, and production-management accounts can all see them; whoever handles the item is recorded as the actual handler.

If an item remains unresolved for more than `3 days`, has a large amount / quantity impact, or matches high-risk rules, it should enter the `boss / management review` list. This list is for review and visibility, not approval, and it does not require boss confirmation. The system does not automatically cancel the remainder, release inventory, or block office handling based on customer communication. Amount / quantity thresholds should be configurable, and V1 can initially reuse the high-risk evidence rules for self-pickup quantity changes.

Office actions in the remaining-quantity todo should include: `keep holding`, `contact customer`, `customer no longer wants it, cancel remainder`, and `replenished, move to waiting for outbound`. The system records operator, operation time, reason / note, and customer confirmation method.

Even if the remaining quantity is overdue, the system must not auto-cancel it. Cancellation requires office confirmation based on customer communication.

The long-term target is earlier picking/preparation before outbound, so mismatch records should feed inventory accuracy, warehouse/location cleanup, and advance-picking quality metrics.

When the outbound worker taps `unable to outbound`, they must not directly close the order, release inventory, or modify the customer order.

V1 fixed reasons for `unable to outbound` should include: goods cannot be found, wrong location, unclear customer / pickup person information, document issue, goods not ready, and other.

After submission, the order also enters office exception handling. Office staff or an account with permission decides whether to reconfirm the order, keep searching, modify location, reprint / correct the document, wait for preparation, cancel, or move to inventory adjustment.

When the outbound worker taps `complete outbound`, V1 should not require a photo of the signed paper outbound-note copy for every order. Normal orders rely on retained paper notes, while the system records outbound operator and completion time.

Risk / dispute-prone cases should require a signed-note photo or at least a note with reason:

- third-party pickup
- customer / pickup person refuses to sign
- `quantity mismatch` was used but the customer / pickup person still accepts and takes the actual quantity
- high-value orders, dispute-prone customers, or orders marked by the system as requiring stronger evidence

Customers / third-party pickup people only need to provide the customer name or outbound note, then sign and take the goods. For third-party pickup, the outbound worker remains responsible for checking size, color, and quantity.

Exceptions add actions only when needed:

- insufficient goods: tap `quantity mismatch`
- goods cannot be found: tap `unable to outbound`
- pickup person cannot identify the order: send them back to the office for confirmation

Driver pre-loading check should be a recorded system step, including driver, check time, check result, and package-check summary. If package or quantity differs from the note, the flow should return to warehouse handling or create an exception record instead of silently loading.

The delivery flow should hand the driver packed goods plus the matching document. The driver checks whether goods/packages match the document before loading; if not, the issue returns to warehouse / office, and the driver does not change the order or document.

Before loading, the driver must check each package in the loading checklist. The checklist uses real package records when available and generated temporary rows from package count / quantity when the package records are not connected yet. The driver cannot tap `confirm loaded` until all checklist rows are checked.

After a passed loading check, the driver taps `confirm loaded` and the task moves from `waiting delivery` to `in delivery`. If goods, package quantity, or the document do not match, the driver taps `loading exception`, and the task enters `delivery exception` or returns to warehouse / office handling.

Driver task states in V1 are `waiting delivery`, `in delivery`, `completed`, and `delivery exception`.

The driver task list should follow the office / outbound manual delivery sequence when available. Without a manual sequence, it sorts by latest needed time, urgent mark, and creation time. V1 does not do automatic route optimization.

Delivery sequence / dispatch routes are maintained by office or management users. Warehouse and driver users execute preparation, handoff, loading checks, delivery, and exception feedback; they must not directly edit the driver dispatch plan.

Each list row should show two lines: first line `[delivery] customer #order-tail`; second line `address area / package count / quantity / urgent-or-note mark`.

The driver mobile task detail should show customer, contact, phone number, full delivery address, navigation action, delivery note number, package / quantity, order-line summary, customer notes, office notes, delivery notes, and document notes.

The watermarked delivery photo is the primary required V1 delivery-completion evidence.

When completing a delivery task, the driver must upload a watermarked photo and may optionally upload a signature photo.

The completion page should automatically record driver account, completion time, and location. Receiver name and notes are optional.

After driver completion, delivery evidence should enter an office `pending review` state. Office / management users review the watermark photo, optional signature photo, watermark ID, capture time, location, and duplicate paper-note status before marking evidence as `reviewed` or `retake required`. `Retake required` should create a todo and preserve the original photo, reviewer, review time, and reason; it should not silently change inventory, delivered quantity, or statement amount.

Receiver signature / returned paper note is not mandatory because some customers resist signing. If obtained, the driver should preferably upload the signature photo from the mobile side, then bring back the duplicate paper note for office filing.

If no signature is obtained, the driver should select a reason or enter a short note, such as customer refused to sign, nobody available to sign, or goods left at specified location.

V1 delivery exception reasons are `customer absent`, `cannot reach by phone`, `unclear address`, `customer refused delivery`, `package / quantity mismatch`, `temporary delivery change`, and `other`. Drivers report exceptions only; they do not edit orders, documents, prices, or inventory.

Delivery completion should not wait for the paper duplicate note to return to the office. The driver completion page can optionally record duplicate paper-note state as `brought back`, `not signed`, `customer refused signature`, or `forgotten / lost`. Office staff can later track office-handoff or archive state separately.

Express / less-than-truckload:

- record picked-up state
- carrier name
- waybill/license plate/driver phone if available
- optional handoff photo/note
- no complex logistics tracking in V1
- express / less-than-truckload pickup often happens after workers have left for the day, so V1 should not require real-time mobile confirmation by workshop or warehouse workers
- the main flow is not next-day detailed office backfill; orders can move through `waiting to notify customer to prepare shipment`, `waiting for customer-arranged express / less-than-truckload`, and `waiting for express / less-than-truckload pickup`
- for printed orders, after bag-making setup produces a qualified finished sample and the `finished-goods photo` is uploaded, office or management can notify the customer in the customer WeChat / Enterprise WeChat group that the bag has a finished sample and the customer can prepare express / less-than-truckload pickup
- only after packing is completed, quantity is counted, and goods are placed in the waiting-pickup area should the order enter `waiting for express / less-than-truckload pickup`, so the customer or carrier does not arrive before goods are packed and counted
- V1 should support a `waiting to notify customer` list and generate copyable WeChat / Enterprise WeChat notification text
- notification text should include at least customer, order / delivery note number, product / print content, size, color, quantity, estimated package count / known package count, and pickup instruction, and the notification panel should bring up the finished-goods photo that should be sent
- for printed orders, customer notification must include the bag-making `finished-goods photo`; otherwise the customer may not know which order it refers to or see the final bag state
- the `print photo` is only internal production-process evidence and must not substitute for the `finished-goods photo` required for customer shipment notification
- if a printed order lacks the `finished-goods photo`, the system should block clicking `customer notified to prepare shipment` and ask staff to take or upload the finished-goods photo first
- the notification panel should bring up the order's sendable bag-making `finished-goods photo`, so office staff can send it together with the copied message
- V1 should not automatically send WeChat / Enterprise WeChat messages; office staff copy the text, send the image manually, then click `customer notified`
- V1 customer notification is human-led. The system only creates todos, copyable text, and image prompts; office / management manually copies, sends the photo, sends the message to WeChat / Enterprise WeChat / private chat, then confirms in ERP. Finished-goods photo notifications, goods-ready notifications, and carrier-arrangement notifications should not be part of a customer-group robot auto-send main flow in V1
- even if customer-group automation is added later, it should only assist fixed-template sending for whitelisted customers / whitelisted groups, with kill switches and manual takeover. Complex custom orders, unclear photos, missing information, uncertain dates, repeated customer modifications, or any low-confidence case should continue to use manual sending
- the customer arranges the carrier; when the carrier arrives, they usually ask whose goods they are picking up and identify goods by customer name or goods label
- if the customer does not respond or arrange pickup, the owner's mother calls the customer, but she should not be responsible for system recording
- after-hours express / less-than-truckload physical handoff is usually handled by the on-duty management person; currently this is mainly the owner's mother, but she should not be responsible for system recording
- V1 should not require the on-site handoff person to use the system, take photos, enter waybill numbers, or confirm from mobile
- V1 should support a waiting-pickup list and paper goods label / pickup card showing at least customer, order / delivery note number, package count, quantity, contact information, and notes, so carriers can identify goods on-site
- Goods entering the waiting express / less-than-truckload pickup area must have identifiable package labels / goods cards. Otherwise, next-day lightweight area checks cannot reliably tell which customer or order the remaining goods belong to.
- Express / less-than-truckload shipment is package-based, not bundle-based. A label should be attached to every package. If multiple packages are temporarily placed in a basket, on a pallet, or in the same area, that grouping must not replace per-package labels.
- For multiple packages, the label should show a package sequence such as `1/3`, `2/3`, and `3/3`, so partial pickup still leaves traceable remaining packages.
- Express / less-than-truckload package labels must not show unit price, total price, print unit price, amount receivable, statement amount, or other pricing / finance information. Labels are for on-site identification, locating goods, and pickup only. Pricing remains visible in outbound notes, order details, statements, or permission-controlled finance screens.
- Most orders shipped directly from the factory by express / less-than-truckload are custom printed orders. In V1, package labels are mainly printed by the office, or printed in advance and handed to packing workers. Packing workers attach / staple the label to the matching package during packing, then place the package in the waiting pickup area.
- There should be no separate `label attached / moved to waiting pickup area` button. Packing workers only enter / confirm package count, quantity per package, required weight / notes, and submit `packing completed` in the normal packing action.
- If the order already has valid preprinted / printed labels, submitting `packing completed` implies the labels have been attached and the packages have been placed in the waiting pickup area, so the system moves to `waiting express / less-than-truckload pickup`.
- If formal labels have not been printed when packing is completed, the package / order moves to `waiting label print`. After office staff prints and lightly confirms the print result, only labels confirmed as physically printed move to `waiting express / less-than-truckload pickup`; packing workers do not need to click a second `label attached` action. On site, office staff is assumed to hand the labels to packing workers for stapling / hanging onto packages.
- `Waiting label print` enters the office shared todo pool, is not assigned to a named person, and does not notify the boss by default. If labels are still unprinted after 30 minutes, show a red-dot reminder; if still unprinted before end of day or before the same-day express / less-than-truckload pickup window, move it to the top of the office todo list.
- In V1, the `waiting label print` queue should be workshop-first rather than defaulting to mixed cross-workshop printing. When packing workers submit package details, the system automatically carries source workshop, related machine(s), submitter, submit time, order number, customer, package count, and quantity into the print task.
- The office label-print page should default to workshop entries / tabs such as `Workshop 1`, `Workshop 2`, `Workshop 3`, and `All`. Each workshop entry should show waiting-label count, earliest submit time, and whether it has print exceptions. Office staff enters the workshop queue first, then prints that workshop's labels, without manually searching for orders.
- Example: the helper for Workshop 1 handles machines A/B/C and submits 3 express / less-than-truckload package records. Office staff opens the label print page, selects `Workshop 1`, and the system shows those `waiting label print` tasks for single-order or batch printing.
- If one order spans multiple workshops / machines, V1 should group the print task by the actual packing submit location or the submitter account's workshop, while details still show related machines and source work orders. This avoids the same label task appearing in multiple workshop queues and being printed twice.
- Inside each workshop queue, waiting-label-print tasks default to `urgent / ships today` first, then submit time from earliest to latest. Multiple packages under the same order must stay adjacent, such as `1/3`, `2/3`, and `3/3`, rather than being split by other orders.
- After office staff prints labels, V1 should not require packing workers to click `label received` in the system. On site, packing workers either come to the office to pick up labels, or come to the office and ask office staff to print the relevant workshop / order labels.
- If labels are printed while the packing worker is not present, V1 uses only a local physical convention and no extra system field, such as fixed workshop label folders / trays: `Workshop 1 labels`, `Workshop 2 labels`.
- If packing workers find a label issue such as wrong customer, wrong quantity, wrong package sequence, unclear text, or unreadable barcode, their mobile side only needs a `label issue` action with reason / note. Office staff handles checking, voiding, and reprinting; packing workers do not directly edit labels.
- If shipping display name is missing, a voided label has not been reprinted, printing fails, or the on-site label is unclear / attached incorrectly, the package should not enter normal `waiting express / less-than-truckload pickup`; it should stay in `waiting labeling / pending confirmation` or `label exception`.
- Unlabeled goods or goods with unclear labels should stay in `waiting for labeling / pending confirmation` and should not formally enter `waiting for express / less-than-truckload pickup` until an office account or another account with print permission prints or reprints the label and hands it to packing workers to attach to the package.
- Lost labels, labels attached to the wrong package, damaged labels, and unreadable labels all enter `label exception`. Office staff selects a reprint reason and reprints; when the new label becomes effective, the old label is automatically voided / replaced. The same package can have only one valid label at a time.
- Before the office closes, unresolved `waiting label print` tasks should be pinned for office staff. If an express / less-than-truckload order is expected to finish during overtime and ship the same evening, office staff should preprint estimated labels before leaving where practical, or an account with print permission can print / reprint during overtime.
- If the office has closed, no valid label exists, and no print-permission account handles it, the system must not move the goods into normal `waiting express / less-than-truckload pickup`. Goods can be placed physically for the moment, but the system remains `waiting label print / waiting labeling`. If the carrier actually takes the goods, the next day office staff must confirm it as `picked up without valid label exception`, record the actual delivery date, and add handling notes.
- carrier name, waybill number, license plate, driver phone, handoff photo, and notes are optional fields; V1 should not require them for completion because they are often unavailable or nobody records them on-site
- express / less-than-truckload completion should use a lightweight pickup-area check: the next morning or at a suitable time, warehouse or office checks the waiting-pickup area; if goods are still there, they remain waiting for pickup, and if goods are gone, the operator clicks `picked up`
- clicking `picked up` should not require waybill number, driver, license plate, or photo; the system records confirmer and confirmation time
- `Packing completed + label attached + placed in the waiting express / less-than-truckload pickup area` only means goods are ready for pickup. Inventory remains physically in the factory but is reserved / locked and unavailable to other orders. At this point, the system must not deduct inventory, create the formal delivery record, or include the goods in a customer statement.
- After staff clicks `picked up`, the system deducts inventory, creates the express / less-than-truckload handoff / delivery record, and includes the batch in the matching statement period by delivery date.
- `Picked up` should store both system confirmation time and actual delivery / pickup date. If the next-day check can determine that the carrier picked up the goods the previous evening, staff may set actual delivery date to the previous day. If unknown, default to the confirmation date.
- Example: goods are packed and placed in the waiting pickup area on June 1 afternoon, which only reserves inventory and does not enter statements. On June 2 morning, office staff sees the goods are gone and clicks `picked up`; actual delivery date can be set to June 1, so the batch belongs to the June 1 statement period.
- if the customer later provides waybill information or a dispute occurs, staff can add carrier information or notes later
- completion means handed to express / less-than-truckload or picked up by carrier, not final logistics delivery; V1 does not track later transport events

Express / less-than-truckload label plan:

- On-site proof differs by fulfillment method:
  - self-pickup uses outbound / pickup notes;
  - driver delivery uses delivery notes handed over with packed goods;
  - express / less-than-truckload should not force delivery notes as the primary on-site identifier and should use per-package shipment labels instead.
- The package label is the paper representation of the ERP package record, not a separate system: order -> packing record -> package details -> package ID per package -> print shipment label -> attach label to package -> move to waiting pickup area -> next-day pickup check -> handoff / delivery record -> unified customer statement.
- The label helps identify packed goods after packing, lets after-hours carriers find the correct goods, supports next-day lightweight checks of which packages remain, and can later link back to the ERP package detail by barcode / QR code.
- Recommended label material is a small waterproof, tear-resistant label / wash-label-like tag to reduce material cost and damage.
- Preferred attachment method is stapling / hanging the label onto the package.
- Express / less-than-truckload labels support two print entry points:
  - Main flow: after packing workers enter / confirm package details, the system generates actual package IDs and office staff prints labels per actual package.
  - Preprint flow: office staff can generate estimated package IDs and print labels in advance based on the expected package count, then hand them to packing workers.
- In the main flow, after packing workers submit `packing completed`, the order / package first moves to `waiting label print`. After office staff prints labels and confirms they were physically printed, the system automatically moves those labels to `waiting express / less-than-truckload pickup`. This transition is triggered by print-result confirmation and does not add a packing-worker confirmation step.
- `Waiting label print` is a lightweight reminder that is more urgent than ordinary back-office todos because carriers may arrive in the evening. V1 should remind only the office shared pool and should not put this into boss review/watch by default.
- The office label-print page should default to workshop-based `waiting label print` queues and keep an `all waiting label print` view for overview; printing should normally happen inside one workshop queue. If packing-worker self-service printing is added later, it should reuse the same queue and permission controls.
- The office label-print page should support workshop-based batch printing. After entering a queue such as `Workshop 1`, office staff can select multiple `waiting label print` tasks or multiple packages under the same order and print them continuously.
- If office staff selects tasks across multiple workshops from the `all waiting label print` view, the system should split them into separate print batches by workshop, with separate previews, confirmations, and print-result handling. This prevents labels for different workshops from being mixed into one stack.
- Workshop queue default ordering is `urgent / ships today` first, then submit time from earliest to latest. Multiple packages under the same order should display and print consecutively.
- There is no system confirmation step for physical label handoff after printing. Packing workers can pick labels up at the office, or ask office staff to print them when they come to the office. The system records only print / reprint / void actions, not `packing worker received labels`.
- Packing-worker label feedback should stay lightweight. The mobile side should offer only `label issue`, with reasons such as `wrong quantity`, `wrong customer`, `wrong package sequence`, `label unclear`, `wrong package`, `label lost`, `label damaged`, and `other`.
- For overtime shipments after the office has closed, use preprinted labels where practical or print through an account with print permission. Without a valid label, the system must not normally move the goods to waiting pickup; if the carrier still takes the goods, the next day office handles it as an exception confirmation.
- Before batch printing, the system must show a preview / confirmation summary with customer, order tail number, workshop / machine, package count, package sequence, label count, and whether any labels are reprints after voiding. This prevents printing a wrong batch at once.
- After batch-print confirmation, the system prints labels continuously by order and package sequence and creates a print-batch record with batch ID, printer user, print time, printer device, order / package / label IDs, label count, success / failure status, and failure reason.
- Clicking `print` must not make the system assume paper labels were physically printed correctly. Office staff must lightly confirm the print result with one of: `all printed`, `partially printed`, `not printed`, or `uncertain`.
- Only labels confirmed as physically printed can move from `waiting label print` to `waiting express / less-than-truckload pickup`; unprinted labels remain in `waiting label print` and can be reprinted.
- Batch printing supports `partial success`. Example: a 5-label batch jams at `3/5`; office staff can mark `1/5` and `2/5` as printed, and `3/5`, `4/5`, and `5/5` as not printed. Printed labels become valid and move to waiting pickup; unprinted labels remain waiting label print.
- If office staff is uncertain which labels printed and which did not, the system must not release the batch automatically. The whole batch enters `print exception` until a human checks and either confirms or reprints.
- Label reprints must require a reason. Suggested V1 fixed options are `paper jam`, `out of labels`, `label damaged`, `label attached to wrong package`, `package count changed`, `information changed`, and `other`.
- Reprint records should store reprint user, reprint time, reprint reason, old label ID, new label ID, and order / package ID.
- The same package can have only one currently valid label at a time. When a reprint makes a new label effective, the old label is automatically marked `voided` or `replaced`. Voided labels must not enter waiting pickup and must not be used as valid package labels.
- V1 batch printing should limit one batch to at most `20 labels`. Larger selections should be split into multiple batches to reduce wrong-batch, paper-jam, and difficult-reconciliation risk.
- Batch print order should be `workshop / zone -> order -> package sequence`, and V1 should normally print one workshop per batch. Example: `Workshop 1: Zhang San order 1/3, 2/3, 3/3; Li Si order 1/2, 2/2`, so office and packing workers can distribute / attach labels in order.
- V1 should not print an additional batch checklist or label handoff sheet. The batch preview, print-batch record, and labels themselves are enough; avoid adding another paper artifact and another handoff check step.
- V1 has only one express / less-than-truckload package-label template. Label-paper size is provisional and should be finalized after real label-paper and printer testing. V1 does not support multiple templates, multiple sizes, or customer-specific labels.
- When label space is limited, customer name has first priority and should generally not be omitted; shipping display name can be truncated; ERP detail keeps full customer name, full display name, and full order information.
- The system should support `test print` for calibrating label paper, printer, and template position. Test print does not generate a formal label ID, does not change order / package state, and does not enter formal print-batch records.
- V1 still limits printing / reprinting to office staff or accounts with print permission. V1.5 can consider packing-worker self-service printing, but it must reuse the same print queue, permissions, reprint reasons, old-label voiding, and print-record rules.
- Preprinting does not finalize package details. When packing is complete, labels must be checked against actual package count, quantity per package, and package sequence.
- If actual package count, sequence, or per-package quantity differs from the preprinted labels, the old labels must be voided and labels must be regenerated / reprinted from actual package details.
- Example: expected `2 packages` are preprinted as `1/2` and `2/2`; actual packing becomes `3 packages`, so the old labels are voided and `1/3`, `2/3`, and `3/3` are reprinted.
- Void / reprint history should store old label ID, new label ID, package ID, void reason, operator, and timestamp. Voided labels must not be attached to packages or enter the waiting pickup area.
- V1 does not require physical collection, photo proof, or signed destruction confirmation for unused / voided paper labels. The hard requirement is marking the label as `voided` in the system. Office staff or packing workers should tear up / discard the old paper label and must not attach it to a package.
- Label status should track the print lifecycle only and should not require packing workers to separately confirm physical attachment. Suggested statuses include `pending print`, `waiting label print`, `preprinted`, `printed`, `voided`, and `reprinted`.
- Suggested label content:
  - line 1: customer name / shipping display name
  - line 2: size + bag color + print color + print side
  - line 3: package quantity + package sequence
  - line 4: fulfillment method + order tail number + phone tail number / note
  - bottom: barcode / QR code / package ID
- Example:
  - `Zhang San / Midea air conditioner`
  - `30*38 red bag yellow print same both sides`
  - `500 pcs  1/2`
  - `LTL  #0238  phone tail 1234`
  - `[barcode/QR code]`
  - `PKG-20260627-0238-01`
- Customer name should appear first because carriers usually ask where a customer's goods are.
- Shipping display name should also be prominent because it is often the easiest physical identifier for the goods.
- For express / less-than-truckload custom printed orders, shipping display name must be present before formal package labels can be printed or goods can move into the waiting pickup area. If missing, the system should prompt office staff to fill it; self-pickup, driver delivery, and ordinary stock/common-goods orders do not require it.
- Labels do not show prices and do not affect month-end statements. Self-pickup, driver delivery, and express / less-than-truckload use different on-site documents, but customer statements are generated uniformly from ERP order lines and delivery / handoff records.
- Labels should not show full phone numbers. They should show only phone tail digits, such as `phone tail 1234`. Full phone numbers remain visible only in ERP detail pages, the express / less-than-truckload pickup list, and permission-controlled back-office views.
- Carriers normally should not contact customers from package labels. If customer contact is needed on site, office or management looks it up in ERP. Customer-level exceptions can be added later.
- If both customer name and shipping display name are long, the label prioritizes customer name first and shipping display name second. Customer name must not be omitted; shipping display name may be truncated on the label while ERP keeps the full value. V1 can support manual short names first, then automatic truncation later.

Express / less-than-truckload pickup confirmation:

- Next-day confirmation of `picked up / still in waiting pickup area` enters the office shared todo pool and is not assigned to a specific person.
- Office clerks, production supervisor, owner-mother / management accounts can confirm. The system records the account that clicked the action as the system confirmer.
- There is no mandatory `on-site checker` field and no required separate on-site-check workflow.
- If an office clerk confirms after asking a packing worker, warehouse worker, or supervisor, they may optionally add a note such as `asked supervisor, picked up last night`.
- Ordinary cases should remain light; notes are mainly for exceptions, disputes, or unclear labels.
- Batch confirmation is supported. Office / warehouse can compare the waiting-pickup area against the list and handle many packages at once:
  - packages still present remain `waiting pickup`;
  - packages no longer present can be selected and marked `picked up`;
  - the same batch can share one actual delivery date, such as `yesterday`;
  - disputed packages or packages with unclear labels remain in exception handling.
- The system stores package-level status while the UI can support whole-order batch actions.
- Package statuses should include `picked up`, `still in waiting pickup area`, and `label exception`.
- Order status is summarized from package statuses:
  - all packages picked up: `handed to express / less-than-truckload`;
  - some packages picked up: `partially picked up by express / less-than-truckload`;
  - all packages still present: `waiting for express / less-than-truckload pickup`.
- Example: one order has 3 packages. The next day, packages `1/3` and `2/3` are gone, while `3/3` remains. The order shows `partially picked up, 2/3 packages gone, 1 package waiting pickup`.

Express / less-than-truckload reconciliation and split pickup:

- Billing / statements use actual delivered quantity and actual delivery date, not production completion time or order completion time.
- Order completion is a production / fulfillment status and is not the only billing trigger.
- Self-pickup, driver delivery, and express / less-than-truckload all enter statements by actual delivery batches.
- Express / less-than-truckload creates receivable and delivery records only for packages marked `picked up`; packages still in the waiting pickup area do not enter statements.
- When pickup crosses statement periods, each package / batch enters the matching period by actual delivery date.
- Customer-facing statement summaries should aggregate by order line for the current period, while internal detail keeps package / delivery-batch records.
- Example: an order of `1500 pcs` has `3 packages`. Two packages, `1000 pcs`, are picked up on June 30; one package, `500 pcs`, is picked up on July 1. The June statement includes `1000 pcs`; the July statement includes `500 pcs`; order detail cumulatively shows original `1500` and delivered `1500`.

Unpicked remaining packages and exception handling:

- Remaining express / less-than-truckload packages are uncommon but must be handled.
- If next-day confirmation finds packages still in the waiting pickup area, their status is `continue waiting for express / less-than-truckload pickup`.
- After `1 day`, remind the office. After `3 days`, move to `follow-up required`.
- The system must not automatically cancel or release inventory.
- Office actions should include `continue waiting`, `contact customer`, `customer cancels remainder`, `change to delivery / pickup`, and `notify customer again to arrange carrier`.
- These reminders enter the office shared todo pool, are not assigned to one person, and do not require boss approval.
- Most waiting-pickup-area orders are custom orders. If the customer cancels an unpicked remainder, that custom package generally becomes `custom cancellation pending scrap / pending handling`, not normal stock.
- Only non-custom reusable stock/common goods can return to available inventory.
- If the customer rejects the package because of printing or bag-making issues, link the package to an exception / complaint / quality issue.
- Unpicked packages do not enter customer statements.
- Inventory reservation can be released, but custom products must not become general sellable inventory; they enter pending handling.
- Customer cancellation of unpicked packages should record cancellation reason, operator, time, package ID, quantity, and handling result.

Custom cancellation pending scrap and responsibility trace:

- V1 should avoid complex scrap approval.
- Office staff can initiate `custom cancellation pending scrap`.
- Final `scrapped` status requires production supervisor or management confirmation, not boss approval.
- Scrap records retain order, customer, package ID, quantity, reason, initiator, confirmer, and timestamps.
- Photos are optional, not mandatory.
- Before confirmation, the package remains `pending handling`. The system never auto-scraps.
- Unshipped scrapped / pending-handling packages do not enter customer statements.
- If the customer cancellation is caused by printing / bag-making problems, link to the corresponding exception / complaint / quality issue.
- Scrap quantity enters responsibility tracing but does not automatically create payroll deduction.
- Responsibility clues should record order, package ID, quantity, reason, and possible step: silk-screen, bag-making, packing, customer cancellation, or other.
- If the problem is clearly print, bag-making, or packing error, link the responsible operator, machine, photo, and completion report where available.
- Whether to deduct performance and how much is handled later through performance / responsibility confirmation. That confirmation must not block orders, outbound, or statements.
- If the customer simply cancels, it is not workshop responsibility; record it as customer cancellation.

Customer notification for unpicked express / less-than-truckload:

- V1 does not automatically message customers when goods are ready but no carrier has picked them up.
- The system generates copyable text for office staff to send manually to WeChat / Enterprise WeChat groups.
- If no pickup happens after `1 day`, remind the office to send the message or call the customer.
- V2 can consider automatic fixed-template sending after customer-group automation exists.
- The message should include customer, shipping display name, size, color, package count, quantity, and pickup instruction.
- Example: `Your Midea air conditioner 30*38 red bag, 2 packages, is ready. Please arrange express / less-than-truckload pickup at the factory.`

## Customer Profile Requirements

Customer profiles should separate the `customer entity` from `contacts`.

The customer entity stores customer name, short name, default settlement rules, default price tables, risk state, customer-group record, and long-term business preferences.

Contacts belong under the customer entity. A customer can have multiple contacts for ordering, payment, statements, pickup, delivery communication, or after-sales communication.

Customer profiles should support multiple contacts, phone numbers, and delivery addresses.

Each customer can have a default contact, default phone number, and default delivery address.

Contacts can be marked with roles such as customer owner, finance, family member, worker, third-party pickup person, third-party printing worker, or other. These roles are for recognition and filtering only and do not affect pricing.

In business terms, each customer normally has at most one order group.

The customer group should be recorded as part of the customer profile. Fields should include at least group name, platform, group owner / maintainer, member-role notes, whether the group is used for ordering, whether it is used for statements, whether it is a future automation candidate, and notes.

In V1, a `customer group record` is business metadata only. It does not mean the ERP has technically integrated with WeChat or Enterprise WeChat.

Customer group names should follow the unified naming rule created when the group is created and should not be changed casually.

If a customer group must be renamed, an authorized account should update the customer profile and preserve group-name history, operator, timestamp, and reason.

Customer-group to customer-profile records must support manual correction.

Manual correction should preserve old group info, new group info, operator, timestamp, and reason.

Group members may include the customer owner, customer finance staff, family members, customer workers, third-party pickup people, third-party print workers, and similar participants. The system must not assume that the sender of a message, order, or payment screenshot is the customer owner personally.

Customer profiles should support fulfillment preferences such as default fulfillment method, common delivery address, common contact, common notes, and whether the customer often uses express / less-than-truckload.

When order-entry paste parsing finds contact, phone, address, delivery, or pickup information, the system should prefill those parsed values for office confirmation.

When the pasted text does not include contact, phone, or address, the system should default to the customer's profile defaults, and office staff can manually change them.

When the pasted text does not include fulfillment method, the system can prefill the customer-profile default fulfillment method for office confirmation. Explicit current-order requirements always override customer-profile defaults.

Delivery notes, outbound notes, pickup records, and driver tasks should use the confirmed contact, phone, and address snapshot on the current order / fulfillment record, not whatever is currently default on the customer profile.

Later changes to customer-profile defaults must not overwrite historical order, delivery-note, or statement evidence address/phone snapshots.

Every order / fulfillment record should store snapshots of the confirmed contact, phone, address, fulfillment method, customer notes, and office notes used at that time.

Customer profiles should store default settlement and payment-term settings. Supported defaults include immediate settlement, every 5 days, every 7 days, every 15 days, monthly, and custom terms. Orders / statements prefill from the customer profile, but authorized accounts can adjust per order when actual handling differs.

Customer profiles should link to default bag price table `1/2/3` and print price table `1/2/3`. New customers default to bag price table `1` and print price table `1`.

Order entry should auto-load the customer's linked bag price table and print price table, then save order price snapshots. Later customer-profile price-table changes or price-version changes must not rewrite historical order prices.

Customer profiles can store default packing preferences, such as usual pieces per package, whether weighing is required, whether there is a transfer-warehouse / ocean-shipping single-package weight limit, and common notes.

V1 should only support customer-level default packing preference, not `customer + size/category` packing preference.

Customer-profile default packing preference and historical packing experience are only prefill / hint inputs for order entry and packing. They must not overwrite explicit current-order customer requirements.

If a specific size or one order has special packing requirements, handle it as current-order packing requirement / order note first.

If later data shows that the same customer often uses different packing rules for different sizes or categories, extend the system with customer + size/category packing preferences.

When a customer temporarily changes packing requirements, the change should affect only the current order by default.

While handling a temporary packing change, office staff can check `save as customer default packing preference`; only then should the customer profile be updated.

If not checked, one special request must not pollute the customer's long-term default packing rule.

Customer notes should be separated by type instead of being mixed into one text field.

Recommended note areas:

- customer-visible notes: business notes the customer can understand or notes that may appear on documents / statements
- office internal notes: internal reminders, temporary communication, and special attention points
- finance notes: statement, payment, debt, rounding, invoice, or payment-handling notes
- packing / fulfillment preferences: usual pieces per package, weighing requirement, express / transfer-warehouse requirements, and common delivery notes

The customer list should show at least customer name, short name, default fulfillment method, statement cycle, debt balance, overdue amount, risk state, latest order time, common sizes / colors, customer-group record status, and latest after-sales / complaint marker.

The customer list should support filters for risk state, debt / overdue status, settlement cycle, price table, whether customer-group info is recorded, latest order time, and common fulfillment method.

Customer profiles should show customer risk state and risk sources: current debt, overdue debt, unresolved after-sales, recent complaint count, recent temporary packing changes, historical disputes, management manual marks, and similar signals.

Recommended customer risk states are `normal`, `watch`, `management confirmation required before order acceptance`, and `order suspended`.

`Normal` does not show special risk or affect order entry.

`Watch` shows hints in order entry and customer detail pages but does not block saving orders.

`Management confirmation required before order acceptance` lets office staff enter draft / order information, but formal acceptance requires confirmation from an authorized account.

`Order suspended` should block formal order creation by default unless an authorized account releases or exceptionally allows it.

Recommended risk triggers include overdue debt, debt above threshold, repeated complaints, frequent order / packing changes, historical disputes, and manual management marks.

Normal customer risk should only be shown as hints in order entry and customer detail pages. It should not block office staff from saving orders; management manually decides whether to chase payment, pause cooperation, or handle the customer specially.

Only rare high-risk customers should use `management confirmation required before order acceptance` or `order suspended`; these states are off by default.

Customer-risk state changes should record before/after state, operator, timestamp, reason, and notes.

Setting or removing `management confirmation required before order acceptance` or `order suspended` requires customer-risk handling or management permission.

## After-Sales / Customer Complaint Requirements

V1 should support lightweight after-sales / customer complaint records, not a complex after-sales system.

Typical examples:

- customer reports `50 pieces short` with a WeChat screenshot or photo
- customer reports red bags were shipped as black bags
- customer reports print position offset, wrong print color, missing print, ghosting, or dirty screen / stains, with photos
- customer reports one package was broken and quantity inside is disputed

Complaint records should link to customer, original order number, order line number, delivery / outbound / express handoff record, feedback time, and entry operator.

V1 issue-type options should include short shipment, wrong goods, print problem, damage, quantity dispute, customer misunderstanding, and other.

Evidence should support customer WeChat / Enterprise WeChat screenshots, customer photos, internal verification photos, and delivery / pickup / carrier handoff evidence.

V1 handling-result options should include pending confirmation, confirmed factory responsibility, confirmed not factory responsibility, replacement / supplemental shipment, exchange, compensation, discount / allowance, return, customer accepts no action, and other.

Complaint handling results may affect customer statement amount.

Complaint records should support an `after-sales adjustment amount`, which flows into the customer statement adjustment amount or notes.

If there is no amount impact, such as wrong goods for a local customer resolved by exchange, the complaint remains an internal and fulfillment record without changing statement amount.

Examples:

- for local stock/common-goods delivery, short shipment usually needs supplemental shipment linked to the original order / delivery note, usually without direct price reduction
- for local stock/common-goods delivery or self-pickup short quantity, prioritize supplemental shipment / filling the shortage through inventory outbound and fulfillment, without treating it as new sales revenue
- for custom printed orders where silk-screen or bag-making issues cause actual quantity below ordered quantity, usually bill by actual qualified delivered quantity or create a discount / allowance; only a small number of self-operated online-store or must-fill cases should use blank stock outbound plus small-plate manual silk-screen plus supplemental shipment
- print problems usually require compensation or discount / allowance, creating an after-sales adjustment amount that affects final receivable
- wrong goods for local customers can often be resolved by exchange; if exchange is completed and no price difference exists, statement amount is unchanged
- for self-operated online-store customers, wrong goods or quality issues may require compensation or exchange; the system should support both outcomes and record whether amount is affected

Supplemental shipment / exchange should create an `after-sales supplemental / exchange fulfillment task`, but it must not count as a new sales order or new revenue.

The task must link to the original order, order line number, original delivery / outbound / carrier record, and after-sales / complaint record.

Examples:

- local stock/common-goods short by 50 pieces should create a supplemental task for the driver to deliver 50 more pieces, using inventory outbound and delivery flow
- wrong black goods that should be red should create an exchange task; the system records red goods outbound/delivery and whether black goods are returned, return time, returned quantity, and inbound / handling result
- self-operated online-store supplemental shipment should create a supplemental task and go through express / less-than-truckload handoff again

Exchange tasks should track returned wrong goods: expected return quantity, actual returned quantity, return status, and returned-goods handling method.

V1 return-status options should include pending return, returned, customer will return next time, customer refuses return, unable to return, and no return required.

V1 returned-goods handling options should include restock, downgraded restock, scrap, internal handling, and pending handling.

Examples:

- if the driver delivers red goods and brings black goods back, record actual returned quantity and handling result
- if the customer says they will bring wrong goods back next time, mark `customer will return next time` and keep a follow-up reminder
- if the wrong goods were opened or used and cannot be returned, mark `unable to return` with reason
- if returned goods can still be sold as stock/common goods, use restock; if only suitable for lower-value handling or internal use, use downgraded restock / internal handling; if unusable, use scrap / pending handling

After-sales supplemental / exchange tasks can reuse normal fulfillment capabilities: inventory outbound, packing if needed, delivery / pickup / express handoff.

Inventory movements should record source as after-sales, without duplicate sales revenue.

Customer statements should show only after-sales adjustment amount or notes, and should not add duplicate sales revenue because of after-sales supplemental / exchange fulfillment.

V1 should include an `after-sales follow-up` list to remind office staff about unresolved after-sales items.

Typical items entering follow-up:

- customer promised to return wrong goods next time, but the goods are not returned after the agreed time or default 7 days
- customer reported short shipment, but supplemental shipment / discount / other handling is not confirmed
- self-operated online-store customer requested compensation, but amount is not confirmed
- factory responsibility is confirmed, but performance / deduction result is not confirmed by authorized management
- after-sales supplemental / exchange task was created but fulfillment is not completed

The `after-sales follow-up` list should not block customer order entry, normal production, or normal fulfillment. It is a reminder for office / management to decide whether to follow up, pause cooperation, or push closure.

If verification confirms factory responsibility, the record must include internal responsibility tracing.

Responsibility-tracing fields should include responsible step, responsibility type, responsible account / operator, linked machine, linked reporting / packing / outbound / delivery record, verifier, verification time, and internal notes.

Responsible-step options should include order entry, scheduling, silk-screen, bag-making, packing, outbound, delivery / pickup / carrier handoff, reconciliation / finance, and other.

Examples: wrong goods may trace to packing, outbound, or driver check; print problems may trace to print photo, silk-screen operator, and silk-screen machine; short shipment may trace to package details, outbound check, or carrier handoff.

Because the factory uses performance bonuses and penalty deductions, complaint records should retain whether performance / deduction is affected, deduction amount or performance handling result, confirmer, and confirmation time.

V1 should not automatically deduct money. It should record responsibility tracing, suggested responsible person, suggested responsible step, and suggested handling.

Office staff can proxy-enter customer feedback, verification evidence, suggested responsible person, and suggested responsible step.

Final decision on whether to deduct, how much to deduct, or record only without deduction must be confirmed by the boss or a management account with performance / deduction confirmation permission.

Performance / deduction confirmation records should include confirmer account, confirmer name, confirmation time, result, deduction amount / performance handling method, and notes.

V1 can record performance / deduction result first without automatically calculating payroll. Later payroll integration can use these responsibility records.

Customer-facing communication and statements should show a short neutral reason such as `quantity difference adjustment` or `quality issue adjustment`; detailed responsible step and operator remain internal.

## Finance Requirements

Routine bag-making waste sold as scrap can optionally be recorded in V1 as simple `other income - scrap sale`, with only date, amount, handler, and notes. It must not enter customer order revenue, customer statements, or directly offset a single order's cost.

Back-office customer list should show customer financial status directly, especially current debt balance.

V1 customer list suggested fields:

- customer name
- settlement method / billing cycle
- current debt balance
- oldest debt date
- overdue flag
- latest order/delivery time
- boss review flag

Customer statement workflow:

Customer settlement profiles:

- customers can be immediate-settlement or period-settlement customers
- period-settlement is not only monthly settlement; some customers receive statements every 5, 7, or 15 days
- customer profiles should separate `statement cycle` from `payment due rule`
- V1 settlement fields:
  - settlement method: immediate settlement / period settlement
  - statement cycle: manual, every 5 days, every 7 days, every 15 days, monthly, custom
  - payment due rule: due N days after statement sent, or for immediate-settlement customers due on delivery completion date / statement creation date
  - default whether to include prior unpaid balance

When a period-settlement customer reaches the statement cycle date, V1 should automatically generate a `statement draft pending confirmation`, including delivered orders in the cycle and prior unpaid balance if applicable.

Statement drafts should default to system delivery/outbound records as the source of truth. V1 should not require office staff to manually review every order for missing inclusion or verify every delivered quantity.

Draft confirmation should use an `exception review` model: the system highlights only items that need human handling, such as missing price, unconfirmed abnormal adjustment, cancelled debt carry-forward, disputed order, or one order delivered across multiple statement periods.

V1 hard errors that block sending a statement draft:

- missing price
- order amount calculation failed
- abnormal discount/allowance has no confirmed final amount
- delivery record has no final quantity

V1 warnings that do not block sending:

- one order delivered in multiple batches or across statement periods
- prior unpaid balance carried forward
- customer has debt, overdue debt, or `boss review` flag
- customer-visible notes need office review

Office staff mainly handle highlighted exceptions and customer-visible notes, then manually send the statement to the customer. V1 should not automatically send statements to customers.

Not every customer currently has an order group. Only some customers already have WeChat / Enterprise WeChat groups; some customers settle on site, and some small customers have no group.

`Customer group + payment screenshot recognition` applies only to customers with a recorded / later-automatable order group. Customers without a group still use manual payment entry / confirmation in V1/V1.5.

Customer profiles should support recording a customer order group, but it is not required. In business terms, each customer normally has at most one customer group.

In V1, `binding a customer order group` means business metadata only. It does not mean the ERP has technically integrated with WeChat / Enterprise WeChat APIs.

Suggested customer communication / statement channel values: no customer group, regular WeChat group, Enterprise WeChat group / Enterprise WeChat customer group, private chat, on-site settlement, phone confirmation, and other.

Suggested customer-group fields: group name, group platform, default statement-send group, group owner / maintainer, whether the group name follows the standard naming rule, notes, and whether it is a V1.5 screenshot-recognition candidate.

Customer group members may include the customer, family members, customer finance staff, customer workers, third-party print workers, and similar participants. The system must not assume that the message sender or payment-screenshot sender is the customer personally.

Payment screenshots may be sent by the customer, family members, or finance staff. Payment matching should primarily use customer group, customer profile, unpaid documents, and amount; sender identity is only an auxiliary signal.

Customer group names should be set by the group creator according to a unified naming rule and should not be changed casually. If a rename is necessary, an authorized account should update the customer profile and retain before/after group info, operator, timestamp, and reason.

Customer group to customer-profile records must support manual correction. Corrections should retain old group info, new group info, operator, timestamp, and reason.

For regular WeChat groups, V1 should not implement robot or API binding. It should only record group name, owner, send screenshots, and payment screenshots; later automation also mainly relies on manual upload or manual confirmation.

For Enterprise WeChat groups / Enterprise WeChat customer groups, V1 should also start with manual records. If later automation needs to capture group messages or screenshots, the product should evaluate Enterprise WeChat customer-group capabilities first instead of assuming all WeChat groups can use robots.

Avoid naming the field simply `bound?`, because that may imply technical integration. Prefer separate states such as `has customer group`, `group info recorded`, and `automation candidate`.

For customers with a bound group, the statement is usually sent to the customer's order WeChat / Enterprise WeChat group. For customers without a group, the send / confirmation method should be recorded as on-site settlement, private chat, phone confirmation, or other.

When sending a statement, office staff should also attach the WeChat Pay and Alipay collection QR codes so the customer can transfer payment immediately after checking.

V1 only needs two factory-level fixed collection QR codes in system settings: one WeChat Pay collection code and one Alipay collection code. It does not need multiple collection codes by customer, business type, or payment recipient.

The statement send package or exported file should include these two fixed collection QR codes by default. If automatic embedding is not implemented initially, the send prompt should remind office staff to send these two QR-code images together.

The system should record statement send channel / customer group or other send method, send recipient, sent timestamp, sender, exported file for this send, and whether collection QR codes were included.

Customer replies such as `no problem`, `confirmed`, payment screenshots, or other confirmation content should be linkable to the statement as customer confirmation / payment evidence.

In V1, office staff can upload WeChat / Enterprise WeChat confirmation screenshots, chat screenshots, PDFs, spreadsheets, documents, or other common file attachments while recording customer confirmation. The attachment links to both the statement and the customer-confirmation record; normal confirmations do not require the customer to return the Excel file. Images can be previewed inline. PDFs, spreadsheets, and documents should first show file metadata and allow downloading the original file, without inline PDF rendering, online Office preview, OCR, or table parsing in V1.

- choose customer
- choose date range, filtered by delivery date
- include delivered/completed orders or delivery batches within that delivery-date range
- generate statement
- export and send to the customer's order group or other confirmation channel with WeChat Pay / Alipay collection QR codes
- customer confirms or directly pays
- record confirmation/payment

V1 should not require customers to return the Excel file.

Common customer confirmation methods:

- customer replies in WeChat/Enterprise WeChat with text such as `no problem` or `confirmed`
- customer checks the statement, scans the collection QR code, transfers payment, and sends a payment screenshot to the customer order group

When the customer directly transfers payment and sends a payment screenshot in the group, the system can treat the statement as customer confirmed and move into payment recording / confirmation.

The current practical loop is: statement is sent to the customer group with collection QR codes, customer checks, customer scans and transfers payment, customer posts the payment screenshot in the group, the office hears the payment speaker or waits for remote confirmation, an authorized account records/confirms payment, and the statement is marked paid / settled.

The system should support uploading or recording WeChat/Enterprise WeChat group confirmation screenshots, chat notes, payment screenshots, confirmer, confirmation time, sent group, and system entry operator.

A small number of customers settle immediately per order / fulfillment record instead of waiting for a period statement. Examples include cash-on-pickup during self-pickup, transfer after delivery, or transfer after express / less-than-truckload shipment.

V1 should support `per-order / per-fulfillment payment`, directly linked to an outbound note, delivery note, pickup record, express / less-than-truckload handoff record, or order line.

For self-pickup, driver delivery, or on-site settled orders where the customer transfers payment immediately, office staff, outbound staff, or drivers may submit a `payment received clue`, such as amount, method, screenshot, or notes. Final `payment arrival confirmation / write-off` still requires an account with payment-confirmation permission.

Per-fulfillment payment does not replace period statements. It is an immediate-payment entry point for a small customer group or specific delivery batches.

If an outbound note, delivery note, or pickup record has already been fully paid per fulfillment, later period statement generation must not include it again as unpaid receivable.

Already-paid fulfillment records may appear on customer statements or customer detail as `paid items` for reference, but by default they should not be included in the period's unpaid receivable total.

If per-fulfillment payment is lower or higher than that note's final receivable, the same payment-variance flow applies: variance pending clarification, unpaid balance, rounding/write-off, or overpayment pending handling. The system must not silently change the amount.

Supported payment methods for immediate payment should include cash, WeChat Pay, Alipay, bank transfer, and other.

V1 can include finance/payment permissions, but it should not assume the company has a professional finance role.

Finance-related permissions should be configurable separately, such as payment entry, payment confirmation, statement generation/sending, variance handling, debt viewing, and boss-review access. These permissions may be assigned to office staff, management, or the owner's mother's mobile account.

`Payment entry` and `payment confirmation` must be separated. Office staff can record that the customer said payment was made, upload a screenshot, record that the payment speaker announced money received, or enter an on-site payment clue. Formal `payment arrival confirmation / write-off` must be completed by an account with payment-confirmation permission.

The owner's mother / management mobile account should be able to confirm payment arrival on mobile. The system records confirmer, confirmation time, confirmation method, and notes.

The current real workflow is that the owner's mother receives money remotely, while a payment notification speaker is placed in the office. When payment arrives, the speaker announces it, and office staff or an authorized account records the payment or waits for remote confirmation.

In V1, the payment speaker announcement is only a payment-arrival clue. It must not be treated as the sole source of truth for automatic write-off. Payment state should change only after an authorized account records or confirms the payment.

If the owner's mother confirms payment remotely, the payment record should support remote confirmer, confirmation time, confirmation method, and notes.

V1 still uses fixed collection QR codes plus manual payment entry / confirmation. It should not connect payment interfaces or perform automatic write-off.

V1.5 should first try `customer group + payment screenshot recognition + recommended matching + human-confirmed write-off`.

In V1.5, customers with a bound group post payment screenshots in that group. For customers without a group, office staff can manually upload screenshots or record cash / QR-code payments.

The ERP can use OCR to recognize payment amount, payment method, payment time, transaction number, and similar fields from the screenshot.

For customers with a bound group, the ERP recommends matching by `customer group + recent unpaid statements + amount`, linking to the likely statement, outbound note, or delivery note.

For customers without a bound group, the ERP can make a low-confidence recommendation by `customer + amount + recent unpaid statements`, or send the item directly to manual matching.

If the amount matches exactly and there is only one recent unpaid document, the recommendation is high confidence.

If the amount is close but not identical, the item enters variance pending clarification and can follow rounding/write-off, unpaid balance, or overpayment pending handling rules.

If multiple documents have the same amount, OCR fails, screenshot source is unclear, or the customer may have paid in multiple transfers, the item enters pending manual matching.

V1.5 should not perform fully automatic write-off, to avoid OCR errors, customers posting in the wrong group, split payments, or screenshots not matching actual payment arrival. The system only recommends matches; office staff or an account with payment permission confirms before final write-off.

Later customer-group automation must be split into two separate module designs:

- `Conversation archive reading and business recognition`: reads, retains, classifies, recognizes, and recommends matches. It does not send messages.
- `Customer-group auto-reply / sending agent`: sends fixed ERP-generated reply templates to customer groups. It does not perform OCR write-off or business decisions.

It has been confirmed on the actual client that Enterprise WeChat customer groups / external groups, with internal Enterprise WeChat employees plus regular WeChat customers, do not expose add-robot, group robot, message push, or Webhook entries in chat info or group management. Therefore Enterprise WeChat customer groups should not use the internal-group Webhook robot route as the main solution.

Customer-group automation V1 freeze rules:

- V1 should not implement automatic customer-group reading, automatic order entry, or automatic customer-group replies. Customer-group support in V1 is limited to business metadata, copied original text, screenshot upload, manual review, and manual confirmation.
- V1 customer-group fields stay lightweight: group name, platform, used for ordering, used for statements, group owner / maintainer, notes, and automation candidate level.
- Suggested V1 automation candidate levels are `disabled`, `record group only`, `future pilot candidate`, and `automation forbidden`.
- All customers default to automation disabled. Complex, dispute-prone, or relationship-sensitive customers can be marked `automation forbidden` and should not enter later auto-reply pilots.
- V2 pilots should start with only 5-10 cooperative stable old customers or self-operated store customers with consistent ordering formats and few disputes.
- Even in V2, automatic replies should default to fixed templates such as `recognized, please confirm` or `submitted for back-office checking`. They must not automatically promise accepted order, scheduled production, or guaranteed in-stock shipment.
- Inventory wording in automatic replies can only refer to recognition-time or current-system snapshots and must not imply formal stock reservation. Formal orders still require human review or system re-check of inventory and price.
- Enterprise WeChat conversation archive capability, fees, readable message scope, customer authorization, sending-agent computer, dedicated employee accounts, and stability should be validated separately after V1 page flows and the core order / inventory / outbound / statement process are working.
- V1 internal reminders should not depend on customer groups or internal group robots. ERP workbench, role task pools, and red-dot todos remain the main task system; only severe exceptions get targeted pushes to responsible accounts.

Conversation archive reading and payment handling:

- Conversation archive is responsible for reading and evidence retention, not message sending.
- It should read customer-group order text, supplemental / modification requests, confirmations, rush / chase messages, payment screenshots, statement confirmations, dispute / complaint content, and parseable images, files, voice messages, and similar content.
- ERP classifies incoming messages as order lead, order modification, customer confirmation, payment screenshot, statement confirmation, after-sales / complaint, or ordinary chat / no action.
- For payment screenshots, the flow is: group screenshot -> conversation archive reads image message -> ERP downloads and stores the original image -> OCR recognizes payment amount, method, time, transaction number / flow number -> ERP recommends matching by customer group, customer profile, recent unpaid statements / orders, and amount -> item enters pending write-off -> office staff or an account with payment permission confirms -> write-off becomes final.
- V2 does not perform fully automatic write-off. The system only recognizes and recommends; a person confirms before write-off.
- High-confidence recommendation requires a customer group linked to the customer profile, only one recent unpaid statement/order, OCR amount exactly matching receivable, and payment time after statement send or order completion.
- Medium-confidence recommendation covers close-but-not-identical amount, possible rounding/write-off, unpaid balance, split payments, multiple unpaid statements, or a customer group involving multiple customers / third-party payers.
- Low-confidence / manual handling covers OCR failure, unclear screenshot amount, multiple same-amount statements, split payments, unclear screenshot source, wrong group, or no receivable match.
- If actual received is lower than receivable, mark variance pending clarification first. Staff chooses unpaid balance, rounding/write-off, incorrect statement returned for correction, waiting for next split payment, or other reason.
- If actual received is higher than receivable, mark overpayment pending handling and require manual decision.
- After payment screenshot recognition, the order assistant must not directly reply that payment has been received. It can first send a fixed template such as: recognized payment screenshot, amount, method, time, submitted for back-office checking, please wait.
- After staff confirms write-off, the system may send a fixed confirmation template: payment confirmed, amount, linked statement, thank you.
- If matching fails, do not auto-reply payment confirmation; keep the item pending in the back office.
- Payment evidence retention should include original group message, group name / customer group ID, sender, message time, original screenshot, OCR result, recommended match, human confirmer, write-off time, linked statement / order, variance handling outcome, and follow-up group replies.

Customer-group auto-reply / sending agent:

- The route is `conversation archive + ERP recognition + Enterprise WeChat employee-account sending agent`.
- ERP generates structured results and fixed reply templates. A sending agent reads a send queue and controls dedicated Enterprise WeChat employee accounts to switch groups, paste, send, screenshot, and write back status.
- Prepare 2-3 dedicated Enterprise WeChat employee accounts such as order assistant A/B/C. These are not official group robots.
- Each customer group stores available sending accounts, priority, and whether automatic sending is enabled. If account A is offline, failed, or restricted, pause A, switch to B, mark backup-account sending, and alert staff to inspect A.
- The sending agent runs on a dedicated PC/Mac logged into the assistant accounts. It opens Enterprise WeChat, searches target group, enters chat, verifies current group name equals the target group, pastes ERP-generated template, sends, captures screenshot, and writes status back.
- AI does not directly operate Enterprise WeChat. AI/ERP only generates structured data and fixed templates; the sending agent executes queue tasks.
- Phase one allows automatic sending only to whitelisted test groups. It must not search/send to arbitrary customer groups.
- Before sending, verify target group name, target customer, order draft ID, reply content, current Enterprise WeChat account, and whitelist status.
- Every automatic send stores send task ID, customer group, customer profile, sending account, content, send time, linked order draft / statement / payment record, before/after screenshots, and success/failure reason.
- Safety limits: no free-form content, only fixed ERP templates; do not directly promise accepted order or scheduled production; low confidence, abnormal amount, stock shortage, split orders, complex notes, repeated customer modifications, mismatched payment amount, login expiry, captcha, popup, or network issue should stop or route to manual handling; task IDs prevent duplicate sends; rate limiting and short-window merged replies reduce disturbance.
- Initial order-recognition reply should only ask for confirmation, such as recognized order, fulfillment method, recognition-time stock status, reply confirm to submit for back-office review, reply modify to explain again. Stock wording should say the system currently shows inventory and that back-office confirmation / reservation is still pending. Customer confirmation confirms the recognized content only; in V1/V2 it does not mean the factory has formally accepted the order.
- Internal work should not rely on Enterprise WeChat group robot reminders. Use ERP workbench, role task pools, and red-dot todos for office, warehouse, silk-screen, bag-making, packing, drivers, and management. Only severe exceptions get targeted pushes.
- Rollout stages: test group, self-operated store groups, 5-10 stable cooperative customers, then broader rollout. Later customer automation levels can be disabled, recognize only, recognize plus confirmation reply, recognize plus auto-reply plus manual order review, and high-trust automatic order entry.
- All customers should default to disabled automation.
- Only customers in a test group, self-operated store group, or stable old-customer whitelist can be gradually upgraded by an account with permission.
- Recommended upgrade path: disabled -> recognize only -> recognize plus confirmation reply -> recognize plus auto-reply plus manual order review -> high-trust automatic order entry.
- Do not bulk-enable automatic replies or automatic order entry for all customers.
- Every automation-level change should record customer, previous level, new level, operator, timestamp, reason, and notes.
- Automation level must support one-click downgrade or disable. If recognition errors, customer complaints, repeated send failures, or payment matching anomalies occur, downgrade first to recognize only or disabled.
- Auto-recognized orders should default to `order draft pending review`, not directly become formal orders.
- In V1/V2, an office clerk or account with order-review permission must confirm the draft before it enters the formal order / accepted-order flow.
- High-trust automatic order entry is a later restricted capability, not a V1/V2 default.
- Later automatic order entry can be considered only when all conditions are met: customer automation level is high-trust automatic order entry; the order is a simple stock / standard-goods order rather than custom printing, outsourced printing, or complex notes; stock-core fields are complete and unambiguous, including size/model, color, handle type, finished-goods style, and quantity; missing fulfillment method / latest needed time is handled as `fulfillment pending confirmation` rather than blocking simple stock automatic entry; inventory is sufficient and trusted; price can be calculated from a price snapshot; the customer has no strong risk, required manual debt handling, complaint, or pricing exception; and the order does not involve shortage splitting, manual price changes, abnormal amounts, complex packing requirements, or special notes.
- If any condition fails, the item must stay in `order draft pending review`, `missing information`, or manual review.
- Automatic order entry must retain source group message, recognition result, satisfied auto-entry conditions, customer automation level, entry time, and system execution log, and office staff must be able to correct or roll it back later.
- Automatic recognition / auto-reply inventory wording can only cite an inventory snapshot and must not promise that inventory has been locked. Formal order creation must re-check and reserve inventory.
- The `order draft pending review` screen should use a side-by-side layout. The left side shows source context: customer group / customer profile, sender, message time, original text, images / files / OCR result, and source message ID. The right side shows parsed ERP fields: customer, fulfillment method, latest delivery / shipment time, order lines, inventory status, price result, risk hints, and missing fields.
- The parsed order-line table should include size, color, handle type, finished-goods style, print / non-print flag, print content / shipping display name, print color, quantity, fulfillment method, latest needed time, inventory status, price result, and risk hints.
- Missing fields, uncertain fields, low-confidence recognition, stock shortage, price exception, and customer-risk signals should be clearly highlighted.
- The review screen should judge blocking missing fields by order type. For stock/common goods, clear size/model, color, and quantity are enough; missing fulfillment method or latest needed time is non-blocking pending confirmation. For custom printed orders, missing production-critical fields such as print image, artwork/file, print content, print color, or print position route to missing information.
- The draft review screen should keep only three primary actions: `create formal order`, `save pending information`, and `void draft`.
- `Create formal order` converts the draft into a formal / accepted order after office confirmation and records reviewer, review time, source draft, and generated order number. `Save pending information` keeps the draft in a missing-information queue. `Void draft` handles invalid orders, duplicate messages, customer cancellations, or recognition mistakes and records operator, time, and reason.
- The same screen may expose secondary actions for `save draft`, `re-run recognition`, and manually split / merge order lines, but the main decision actions remain create, save pending information, and void.
- The risk area should consistently show stock shortage, price exception / manual price override, customer debt / risk, missing print image, unclear delivery deadline, and suspected duplicate order.
- If the source message contains multiple styles, multiple print contents, or mixed stock/custom items, office staff can split the parsed result into multiple orders or sub-orders from the review screen. All split outputs should retain the same source draft and original group message for traceability.

Shared safety and operations requirements for automation modules:

- These requirements apply to both conversation archive reading / business recognition and customer-group auto-reply / sending-agent modules.
- Compliance and prerequisites:
  - Before relying on conversation archive automation, confirm that Enterprise WeChat conversation archive is enabled, which employee accounts are included, and whether external customer-group messages, images, files, and voice messages can be read completely.
  - Confirm customer-side notice/consent requirements, archive fees, retention period, image/file download validity, and historical traceability range.
- Customer group to customer profile mapping:
  - In business terms, each customer normally has at most one customer group. Customers without a group continue through on-site settlement, private chat, phone confirmation, or manual screenshot upload.
  - Group members may include the customer, family members, finance staff, workers, third-party print workers, and similar participants; sender identity is not the same as customer identity.
  - Group names must follow a unified naming rule and should not be changed casually. Authorized renames must update the customer profile and retain before/after info, operator, timestamp, and reason.
  - Customer group records must support manual correction with before/after details and correction reason.
- Deduplication and idempotency:
  - The same payment screenshot must not create duplicate pending write-off items.
  - The same archived message must not create duplicate order drafts, payment items, or complaint records.
  - A successfully sent task must not be sent again.
  - Order drafts, pending payment write-offs, auto-reply tasks, and send tasks require unique IDs, source message IDs, processing states, and logs.
- Human workbench queues:
  - Automation modules must have back-office queues rather than only hidden automatic processing.
  - Suggested queues: pending recognition messages, order drafts pending review, information-missing items, payments pending match, OCR failures, low-confidence matches, replies pending send, send failures, and manual takeover required.
  - Queues should appear in ERP workbench and red-dot todos by role.
- Stop and manual takeover:
  - Sending must stop immediately when group name, customer, order draft, or whitelist validation fails.
  - Login expiry, captcha, popups, network errors, frozen client, or repeated send failures should pause the affected sending account.
  - Each customer group, customer, and sending account needs a kill switch for automation.
  - Customers can be set to recognize-only mode, producing drafts/tasks without sending customer-group messages.
- Template versioning:
  - Auto-reply templates must be versioned and should not overwrite history silently.
  - Template records should include name, scenario, version, effective time, editor, reviewer, and enabled state.
  - Every automatic send stores the actual template version and sent content for later dispute review.
- Explainable recognition:
  - ERP should show recommendation reasons and risk causes, not only a final match.
  - Payment matching should show amount match, customer-group match, customer-profile match, time match, recent receivable match, confidence, and low-confidence reasons.
  - Order recognition should show parsed size, color, quantity, handle type, print content, fulfillment method, missing fields, and uncertain fields.
  - Before confirmation, office staff should be able to inspect original message/screenshot, OCR result, structured result, and match reasons.
- Metrics and staged rollout:
  - Roll out from test groups, to self-operated store groups, to a small set of stable customers, then broader use.
  - Track OCR success rate, recommended-match accuracy, manual correction rate, auto-reply success rate, send-failure reasons, customer complaints/misunderstandings, manual intervention count, and daily labor saved.
  - If metrics degrade, the system should pause a group, customer, automation level, or the entire sending module.
  - When automation is unstable, default back to manual handling without blocking normal order entry, outbound, statements, or payment.

WeChat Pay / Alipay merchant interfaces or aggregated-payment dynamic QR codes are not a near-term priority because fees may be high, most customers are small fragmented buyers, and bank transfer is not realistic for many. Dynamic QR / aggregated payment can remain a future V3 option.

Payment recording should allow entering `actual received amount`; it does not have to equal final receivable.

The system should calculate variance automatically: `variance = actual received amount - final receivable`.

- if actual received is lower than final receivable, do not automatically classify the variance as `unpaid balance` or `rounding/write-off`; first mark it as `variance pending clarification`
- while in `variance pending clarification`, the office should contact the customer to check whether there is statement misunderstanding, missed items, amount misunderstanding, or customer dispute
- if there is statement misunderstanding or customer dispute, mark the statement as `disputed / needs correction` for office correction or further communication
- if there is no misunderstanding, the office should classify the variance as `rounding/write-off` or `unpaid balance` based on customer communication
- customers often do not pay the exact final receivable and may write off a small amount; the system should support confirming small variances as `rounding/write-off`
- when the payment is clearly partial, for example a 15-day statement final receivable is 108,000 CNY and the customer pays 80,000 CNY, the remaining 28,000 CNY should be classified as `unpaid balance` and become customer debt balance
- if actual received is higher than final receivable, classify the variance as `overpayment pending handling`

V1 should support three outcomes for `overpayment pending handling`:

- transfer to customer prepayment/balance: create customer balance that can be applied in a later statement; this is uncommon and should not be treated as a daily main flow
- refund customer: record refund amount, method, screenshot/evidence, operator, and timestamp
- apply as current extra payment: if the customer has previous debt, missing charges, or confirmed extra payment, offset the matching debt/extra-payment record

Overpayment should not be mixed directly into current statement revenue. It must be resolved by selecting a handling outcome.

When variance type is `unpaid balance`, the system should automatically create customer debt balance.

Customer debt balance should link to the original statement, original order/delivery records, unpaid amount, created timestamp, system entry operator, and notes.

When generating the next statement, the system should alert that the customer has an outstanding debt balance and default to including it.

Office staff can manually remove the prior debt from the statement, but the system should retain cancellation reason/note.

Newly created debt should not immediately enter `boss review queue`, to avoid excessive reminders.

V1 default boss-review rules for debt:

- debt more than 7 days past the customer's billing cycle and over 2000 CNY enters boss review
- customer debt balance over 10000 CNY enters boss review regardless of whether it is newly overdue
- amount threshold should be configurable

V1 overdue calculation rules:

- period-settlement customers: billing cycle starts from the date the statement is sent to the customer
- cash-on-delivery / immediate-settlement customers: due on delivery completion date or statement creation date
- adjust later based on real back-office data and customer behavior

When a customer has debt, overdue debt, or a `boss review` flag, V1 should not hard-block new order entry, scheduling, outbound stock, delivery, or statement generation.

The system should show strong warnings during order entry, outbound/delivery, and statement generation, but office staff can continue after human judgment.

In the back-office customer list, the boss should be able to see current debt balance, overdue flag, boss review flag, and open the customer to inspect debt details.

If included in the next statement, the previous unpaid balance should appear as the last row in the customer-facing `statement summary` sheet.

For the unpaid-balance carry-forward row:

- `product / print content`: `previous unpaid balance`
- `notes`: original statement date range and original statement number
- the row should be visually/semantically separate enough to avoid confusion with new order amounts

If the customer pays the debt separately before the next statement, the system should support `standalone debt payment`.

`Standalone debt payment` should directly reduce customer debt balance and link to the original debt record, original statement, paid amount, payment screenshot, received timestamp, system entry operator, and notes.

If the debt is fully cleared, it should no longer be included by default in the next statement. If partially cleared, only the remaining debt should be carried forward.

V1 default boss-review rules for rounding/write-off:

- write-off amount over 5% of the order / statement receivable enters `boss review queue`
- single write-off amount over 100 CNY enters `boss review queue` regardless of percentage
- this alert does not block payment recording

Suggested payment record fields:

- payment source type: statement / outbound note / delivery note / pickup record / express or less-than-truckload handoff record / standalone debt payment / other
- linked document number
- customer
- final receivable amount
- actual received amount
- variance
- variance type
- variance handling outcome
- payment method
- payment screenshot
- received timestamp
- refund/offset evidence
- system entry operator
- handling operator
- handling timestamp
- notes

For split deliveries, each delivery batch should be included in the statement period based on that batch's delivery date. Statement date range should not filter by order date; order date is only a display field for customer order identification.

For express / less-than-truckload orders, the statement date is the actual handoff / pickup date, not the date goods were placed in the waiting pickup area and not necessarily the system confirmation date. During next-day confirmation, if staff can determine that pickup happened the previous evening, they can backfill the actual delivery date to the previous day while the system still stores confirmer and confirmation time.

If one order is delivered across multiple statement periods, for example one batch on June 30 and another batch on July 1, V1 should default to splitting the order into the matching statement periods by delivery date.

If factory self-pickup shortage uses `take actual quantity now, wait for the remainder`, the later remainder batch also enters the statement period by actual delivery date, while still using the original order price snapshot.

Example: original order `500 pcs`; customer self-picks `430 pcs` on June 1 and receives the remaining `70 pcs` on June 3. Both batches use the original order price snapshot. The June 1 statement period shows `430 pcs`, the June 3 statement period shows `70 pcs`, and order details show original `500 pcs`, delivered `430 pcs`, pending `70 pcs`; after replenishment, cumulative delivered becomes `500 pcs`.

For cross-period split deliveries, the `statement summary` notes should show `split delivery`, and `delivery date / batch summary` should summarize the delivery batches included in that statement period.

The customer-send version should aggregate by this-period actual delivery and show total delivered quantity plus final receivable, so customers do not need to add multiple delivery batches manually. The internal archive version retains every delivery batch, outbound/delivery record, and confirmation timestamp.

This rule should be validated against customer acceptance. Later versions can add customer-level statement preferences, such as splitting by delivery date or waiting until the whole order is fully delivered before including it in one statement period.

Statement export format:

- V1 should prioritize Excel export so customers can verify rows, edit notes, and send the file back
- PDF export can be added later for fixed layout, stamp/archive use cases, or customers who explicitly require PDF

V1 should start with the system default Excel template. After the user provides the current real statement template, the product can adapt column order, styling, print behavior, and send habits without blocking the main flow.

V1 Excel should distinguish a `customer-send version` from an `internal archive version`.

The `customer-send version` defaults to a concise `statement summary`, with `delivery details` attached only when needed. The `internal archive version` can include `statement summary` and `delivery details / internal details`.

`Delivery details / internal details` can retain delivery batches, supplemental shipments, adjustment reasons, evidence links, customer confirmations, debt carry-forward, payment matching, and internal notes. It is not sent to customers by default.

V1 customer-facing Excel statements should have two sheets: `statement summary` and `delivery details`.

`statement summary` is the primary customer review sheet. It should aggregate one row per order line / style / print content, not merge different styles or different print contents from the same order into one row.

When multiple rows come from the same customer order, keep the same original order number and each row's line number for traceability.

`statement summary` columns:

- order date
- original order number
- line number
- product / print content
- size
- color
- total delivered quantity
- chargeable quantity
- free / non-chargeable quantity
- delivery date / batch summary
- fulfillment method
- bag unit price
- bag amount
- print unit / step price
- print amount
- other fees
- original amount
- adjustment amount
- final receivable
- notes

Customer-facing statements should show both bag unit price and print unit / step price. For non-print orders, print unit price and print amount should be blank or 0. For print orders, show the matched print step unit price and print amount.

`delivery details` explains split delivery and expands by `delivery batch / outbound record`.

Suggested `delivery details` columns:

- original order number
- line number
- delivery date
- delivery batch / outbound note number
- delivered quantity for this batch
- fulfillment method
- notes

If stock/common-goods supplemental shipment / filling shortage crosses statement periods, `delivery details` should use the actual supplemental delivery date. `Statement summary` should still aggregate it back into the original order line, not show it as a new sales order row.

Abnormal supplemental batches, after-sales supplemental shipment, exchange fulfillment, and similar supplemental fulfillment can appear in `delivery details` as supplemental / fill-shortage batches. In the customer-facing `statement summary`, they should not become separate new sales rows.

When one order line / style is delivered in multiple batches, customers should first use `statement summary` to see total delivered quantity and final receivable for that line without manually adding multiple batch rows.

V1 should show amount by order line / style in `statement summary` and should not require amount splitting by delivery batch. Batch-level amount splitting can be added later if a customer requires it.

The statement `total delivered quantity` means final qualified delivered quantity, not original ordered quantity. `Chargeable quantity` means the quantity used to calculate bag amount and print amount for the current statement period. `Free / non-chargeable quantity` means quantity that was actually delivered but not billed to the customer, such as normal overrun, customer refusal to pay extra, or management-confirmed gift quantity.

Statement amounts must be calculated from `chargeable quantity`, the saved price snapshot, and adjustment amounts. The system must not automatically charge more just because a few extra qualified bags were delivered.

`delivery date / batch summary` can show a single delivery date or multiple-date summary such as `6/1, 6/2, 2 batches total`. If final delivered quantity differs from ordered quantity, reflect the quantity difference and customer-confirmed handling outcome in `notes` or `adjustment amount`.

For `actual outbound + shortage to production`, customer reconciliation should include only quantities actually delivered within the current statement period. It must not bill the undelivered shortage early.

Example: original order quantity 1,000, first delivered quantity 600, shortage 400 to production. The current statement shows only delivered 600. When the remaining 400 is produced and delivered later, it enters the matching statement period by actual delivery date.

When actual quantity is below ordered quantity, statements must not automatically guess discount / allowance or bill by actual quantity. The line should enter statements only after `quantity difference pending handling` is resolved with a customer-confirmed outcome and amount-handling method.

For custom printed short quantity handled as `bill by actual quantity`, set `chargeable quantity = actual delivered quantity` and do not create an extra negative `adjustment amount`. Note example: `original order 1000, actual delivered 980, billed by 980`.

For custom printed short quantity handled as `discount / allowance`, or when the customer negotiation still refers to the original ordered quantity, retain original ordered quantity and actual delivered quantity, put the allowance in `adjustment amount`, and use a concise note such as `quantity difference adjustment`.

If stock/common-goods supplemental shipment, custom small-plate manual supplemental printing, or abnormal supplemental batches are not charged again, `statement summary` should only update the original order line's cumulative delivered quantity, delivery date / batch summary, and notes. Internal records retain full supplemental batch, inventory deduction, packing, and delivery details.

When the customer accepts short shipment, the customer statement should show actual delivered quantity, not original ordered quantity.

Example: original order quantity 600, actual delivered quantity 550, customer confirmed short shipment accepted. `Total delivered quantity` should be 550, and notes can say `original order 600, actual delivered 550, customer confirmed short shipment accepted`.

Normal overdelivery that the customer does not pay for should also be visible on the customer statement to avoid confusion between quantity and amount.

Example: original order quantity `1,000`, actual delivered quantity `1,005`, customer is charged for `1,000`. `Statement summary` shows total delivered quantity `1,005`, chargeable quantity `1,000`, free / non-chargeable quantity `5`, and notes say `5 extra pieces not charged`. This normal gift case does not necessarily require a negative adjustment amount, but the internal confirmation reason and operator record must be retained.

If after-sales / customer complaints create compensation, discount / allowance, extra payment, or other amount changes, they should flow into statement `adjustment amount`, with short notes such as `after-sales compensation`, `quality issue adjustment`, or `quantity difference adjustment`.

If after-sales / customer complaints only create supplemental shipment or exchange without amount impact, statement amount stays unchanged, while internal complaint and supplemental shipment / exchange fulfillment records are retained.

After-sales supplemental shipment / exchange fulfillment tasks must not create duplicate customer statement revenue. They only support inventory and delivery traceability, plus notes or adjustment amount when applicable.

The `statement summary` sheet should include an automatic totals row for total delivered quantity, chargeable quantity, free / non-chargeable quantity, bag amount total, print amount total, other fees total, original amount total, adjustment amount total, and final receivable total.

Statement states:

- not generated
- sent
- customer confirmed
- paid
- disputed
- variance pending clarification
- partially paid
- unpaid balance
- overpayment pending handling

Evidence should link to delivery photos, pickup signatures, and carrier pickup records.

Internal order amount structure should be more detailed than the customer-facing statement and should at minimum store:

- bag revenue detail: size, color, handle type, quantity, bag unit price, bag amount, matched bag price table, and price version
- print revenue detail: print content / merged pricing group, pricing quantity, step tier, print unit price, print amount, matched print price table, and price version
- other fee detail: fee type, amount, and notes
- total amount: bag amount + print amount + other fees

Other fees include freight, express, less-than-truckload, delivery fees, etc.; they should not be mixed into bag unit price.

Customer-facing V1 statements should split bag price/amount and print price/amount by default, while also showing other fees, original order amount, discount/allowance or extra payment amount, final receivable, and a short neutral adjustment reason.

The internal system should retain more detailed revenue component data for future profit calculation after costs are added. Future gross-profit estimation should combine the order price snapshot with size-based material usage formulas and rough or actual material cost. V1 does not include full cost accounting.

Statement amounts should preserve the original order amount and price snapshot while also showing abnormal discounts/allowances, extra payment, and final receivable amount.

Customer-facing adjustment reason examples:

- quantity difference adjustment
- quality difference adjustment
- negotiated discount
- extra payment adjustment

The internal system should retain detailed abnormal reason, discovery step, responsible/source step, management confirmation, office-clerk entry, and customer confirmation record. These details do not all need to be exposed to customers.

Suggested `abnormal discount/allowance record` fields:

- original order
- customer-facing adjustment reason
- internal detailed abnormal reason
- original receivable amount
- discount/allowance amount
- extra payment amount
- final receivable amount
- customer confirmation record
- operator
- timestamp
- notes

Discounts/allowances affect final receivable and statement display only. They should not modify the original order price snapshot, so finance can later see why the collected amount differs from the original amount.

Abnormal discount thresholds should be configurable by amount, percentage, or either condition. Items exceeding the threshold should enter the `boss review queue`, showing customer, order, original receivable, discount/allowance amount, discount percentage, final receivable, abnormal reason, actual management confirmer/contact person, system entry operator, and customer confirmation record.

V1 default threshold: discount/allowance amount over 100 CNY, or discount/allowance percentage over 5%; either condition triggers the `boss review queue`.

## Pricing Requirements

Customer profile links to:

- bag price table
- print step price table

Defaults:

- bag price table 1
- print price table 1

Bag price tables and print step price tables should use the same price-version, mobile review, effective-time, and history retention rules.

The factory does not use one-off special unit prices for individual customers. The owner's own online stores also use the same unified price rules.

V1 price tables should use numbered names such as `price table 1`, `price table 2`, and `price table 3`, rather than names based on customer region or business source.

When creating a customer profile, the default bag price table is `price table 1`; if a customer needs a higher product unit price, the profile can be linked to `price table 2/3`.

For customers priced higher, the higher price is the bag product unit price and should be represented in the linked unified bag price table.

For example, if `price table 1` has a unit price of 0.35 CNY for a size, `price table 2` can have 0.36 CNY for the same size; customers linked to `price table 2` automatically use 0.36 CNY.

Freight, express, less-than-truckload, and delivery fees should be separate order fee items and should not be mixed into bag unit price. This is a rare customer scenario.

V1 should not support `customer-specific price overrides`; this avoids an overly heavy pricing system and long-term individual-customer price management.

If an old customer or a specific order has low/no profit and needs a one-time negotiated price, V1 should handle it only through `current-order manual override`. It must not change the customer's long-term pricing rules.

Order entry:

- V1 manual order entry should allow office staff to set the customer order time to the actual customer order time.
- If future customer-group automation through conversation archive reading, ERP recognition, and an Enterprise WeChat employee-account sending agent supports customer self-confirmed order entry, the system can use customer message / order confirmation time directly, reducing the gap between customer order time and system entry time.
- load prices from the customer's linked tables
- price-table changes should create a new price version
- publishing mode should support `effective immediately` or `specified effective date and time`
- specified effective time should include date and time
- the recommended default for daily use is next-day 07:30 because the factory production day starts at 07:30
- if review confirmation happens after the specified effective time, the price version becomes effective after review confirmation; it must not become effective before review
- when updating prices on the current day, the office should first finish entering prior-day orders that were already placed but not yet entered, using their actual prior-day order time; orders placed today then use the new price
- office staff enter a price-version draft based on management's verbal or WeChat instruction, such as which size should increase/decrease or which print step rule should change
- after office staff save the draft, the system should push it to accounts with `price-table review` permission for mobile review
- the price-review mobile screen should show only changed sizes or print step rules, old price, new price, and effective time, with actions `confirm correct` and `return for edits`
- after any account with `price-table review` permission taps `confirm correct`, the price version can be published/effective according to the configured effective time
- V1 should not require multi-approver signoff
- if the approver taps `return for edits`, the price version returns to draft state and office staff revise and resubmit it; return notes are optional and not required
- the back office should record entry operator, reviewer account, reviewer name, review time, review result, and notes
- price versions not confirmed in the mobile review flow cannot become effective and cannot be used for automatic pricing on new orders
- V1 should retain price-version history; users can view by price table what sizes or print step rules changed, old price, new price, effective time, entry operator, reviewer, and review time
- draft price versions can be deleted
- reviewed, published, or effective price versions cannot be deleted, to preserve historical order price snapshots and reconciliation evidence
- if a price version is reviewed but not yet effective, it can be disabled/voided; if already effective, create a new price version to override it
- order price snapshots should link to the matched price version, so finance can later explain why an order used a specific unit price
- order price snapshots should store bag revenue detail, print revenue detail, other fee detail, and total amount separately
- order price should be calculated by customer order time; the system should match the price version effective at the customer order time
- shipment date, delivery date, or split-delivery dates should not automatically change order price; use current-order manual override when adjustment is needed
- store a price snapshot
- later price-table changes must not modify historical order prices; for example, if 30*38 changes from 0.36 CNY to 0.40 CNY on the 6th, orders saved before the change still reconcile at 0.36 CNY, while new orders use 0.40 CNY
- record price source in the snapshot: customer's linked unified price table, or current-order manual override, plus matched price version and effective time
- treat the order price snapshot as the original pricing basis; do not overwrite it because of later abnormal discounts/allowances
- allow manual override for the current order
- current-order manual override is for temporary negotiated pricing only; it does not create a long-term special customer price
- normal price-table orders should not require a manual override reason
- if office staff changes the auto-loaded price, the manual override reason is required
- V1 manual override reason options: old-customer negotiated price, large-order low profit, balance adjustment / extra payment, entry correction, other
- store before price, after price, difference, reason, operator, and operation timestamp
- no boss approval required for now
- current-order manual override should not block order flow, scheduling, delivery, or statement generation
- if the manual override exceeds threshold, enter `boss review queue`; V1 defaults to amount difference over 50 CNY or difference percentage over 5% of original amount, with either condition triggering review
- manual overrides below threshold should only be recorded and should not alert the boss
- show a clear marker when actual order price differs from linked price table

Bag handle pricing:

- handle material, width, and gram weight are fixed
- pricing only needs to distinguish normal/default handle versus extended handle
- extended handle uses the extended-handle price column
- when the customer does not mention extended handle, use normal/default handle pricing; when extended handle is explicitly mentioned, use extended-handle pricing

Current price/size table:

- image asset: `docs/product/assets/price-size-table-2026-07-03.png`
- table date: 2026-07-03
- the 2026-07-03 image lists base prices for plain, laminated, gift, and bear/dog styles, plus metallic laminated prices; it does not list a separate extended-handle table
- P0 keeps the current default extended-handle rule for plain blank bags: extended handle = base price + 0.03 CNY, until a separate extended-handle table is provided

| Size / style | Base price | Extended / metallic / rule |
| --- | ---: | --- |
| Plain 25*32*10 | 0.29 | extended handle 0.32 |
| Plain 30*36*8 | 0.35 | not listed in the new image; temporarily keep old price, extended handle 0.38 |
| Plain 30*38*10 / 30*37*10 | 0.34 | extended handle 0.37 |
| Plain 35*41*12 | 0.48 | extended handle 0.51 |
| Special 25*23*8 | 0.29 | extended handle 0.32 |
| Special 26*27*10 | 0.28 | extended handle 0.31 |
| Plain 35*27*10 | 0.30 | extended handle 0.33 |
| Plain 40*30*10 | 0.36 | extended handle 0.39 |
| Plain 40*32*10 | 0.37 | extended handle 0.40 |
| Plain 45*37*10 | 0.47 | extended handle 0.50 |
| Plain 50*40*12 | 0.60 | extended handle 0.63 |
| Laminated 30*27*10 | 0.60 | metallic 0.63 |
| Laminated 32*25*10 | 0.45 | metallic 0.49 |
| Laminated 40*30*10 | 0.58 | metallic 0.62 |
| Laminated 45*35*10 | 0.72 | metallic 0.76 |
| Laminated 50*40*12 | 1.00 | metallic 1.03 |
| Bear/dog 25*23*8 | 0.45 | snap/button style |
| Bear/dog 30*27*10 | 0.51 | snap/button style |
| Bear/dog 35*32*10 | 0.57 | snap/button style |
| Bear/dog 40*35*12 | 0.69 | snap/button style |
| Bear/dog 50*40*12 | 0.80 | snap/button style |
| 喜/福 25*30*10 | 0.51 | reduce 0.05 for 1000+ pieces |
| 喜/福 30*37*10 | 0.56 | reduce 0.05 for 1000+ pieces |
| 喜/福 35*41*12 | 0.76 | reduce 0.05 for 1000+ pieces |
| 福 30*30 | 0.53 | Fu only |

Special finished-goods style notes:

- `小熊小狗`, `喜`, and `福` are printed stock/common-goods bags.
- `覆膜` is another product category, more often sold in clothing-related use cases, but the factory currently does not do much of this style.
- `小熊小狗`, `喜`, `福`, and `覆膜` currently use normal/default handle length.
- These prefixes are not ordinary colors or sizes; the system should recognize them as finished-goods style / process type.
- V1 can offer these as stock finished-goods style candidates during order entry instead of requiring customers to restate print content.
- Each finished-goods style has its own allowed size range, and order entry / inventory setup must validate it.
- Current 小熊小狗 sizes: `25*23*8`, `30*27*10`, `35*32*10`, `40*35*12`, `50*40*12`.
- Current 喜 sizes: `25*30*10`, `30*37*10`, `35*41*12`.
- Current 福 sizes: `25*30*10`, `30*37*10`, `35*41*12`, plus `30*30` for Fu only.
- Current 覆膜 price-table sizes: `30*27*10`, `32*25*10`, `40*30*10`, `45*35*10`, `50*40*12`, with ordinary 覆膜 and 覆膜金银 variants.

## Bag Cost And Gross-Margin Estimate

- The current bag cost calculation source is `docs/product/assets/bag-cost-calculation-2026-06-28.xlsx`, originally named `袋子价格计算.xlsx`.
- This calculation is for internal material cost, replenishment/material estimates, and gross-margin estimates. It does not replace the customer-facing bag sales unit price.
- Sales revenue still comes from the order price snapshot: bag price table, print price table, current-order manual override, and other fee items.
- Accounting and gross-margin calculation should be as automatic as possible. Users must not directly edit cost, margin, allocation amount, or loss result on the cost/gross-margin result page.
- Allowed manual intervention sources are limited to bag sales price changes (price-table versions or current-order price snapshots) and raw-material price changes / corrections (inbound price, supplier price, or batch cost snapshot correction). Other cost and margin changes should be derived automatically from order price snapshots, raw-material inbound costs, material issue scans, production reporting, leftover registration, delivered quantity, and system formulas.
- If the accounting result is wrong, staff should correct the relevant source document or price version, with old value, new value, reason, operator, and time retained. They should not type a replacement gross-margin number directly.
- Sheet4 in the workbook acts like the business template with date, size, color, quantity, sale unit price, handle cost, bag body cost, and gross margin excluding labor/electricity.
- Bag body inputs should include bag width W, bag height H, gusset G, fold F, seam S, bag body GSM, fabric unit price, and fabric supplier / raw-material batch.
- Current common bag sizes are maintained below as actual-size rows, and cost estimates should default width, height, gusset, body fabric width, and fabric length from that standard actual-size table.
- Normal/default bag body GSM is 78g. If an actual inbound raw-material batch, special model, or process has a different GSM, the actual batch/spec snapshot should override the default.
- The factory currently has 3 fabric suppliers, and their prices differ. Fabric unit price must not be stored as one global default; it should be stored by supplier / inbound batch. Cost estimates should prefer the actual issued batch price; when no actual batch is selected, office staff should choose the supplier price or use the latest confirmed price and mark the result as estimated.
- Costing must separate three bases: `rough estimate cost`, `actual batch cost`, and `machine/task allocated cost`.
- `Rough estimate cost` is used before order production, before material issue, and for replenishment planning. At that point the final supplier and roll/batch may be unknown, so the system should default to the latest confirmed inbound price for the same material spec or the supplier price selected by office staff. The UI must show price source, supplier, inbound/confirmation date, and an `estimated` marker.
- When multiple supplier prices exist for the same material spec, the rough-estimate view should allow switching supplier price and may show the cost difference by supplier. The default must not hide the price source, so staff do not treat rough margin as exact margin.
- `Actual batch cost` is created after raw-material issue scanning. Raw-material inbound already stores the supplier, batch/roll number, spec, CNY/kg price, and line amount snapshot. When material issue/outbound scanning binds a roll/batch to production, the backend should automatically use that inbound batch cost for body fabric or handle material cost.
- If the scanned actual batch price differs from the earlier rough-estimate price, the system should not overwrite the original rough estimate. It should create or update an `actual batch cost` version and show the variance from the estimate.
- If one roll is used across several orders, replenishment tasks, or rush insertions, scanning can identify the roll's actual inbound price, but per-order consumption may still need allocation by machine, task, qualified output, size-based usage formula, and leftover records. That result should be marked as `machine/task allocated cost`, not fully exact per-order cost.
- The accepted bag-cost closed-loop flow is `inbound cost snapshot -> raw-material label -> material issue scan -> production reporting / leftover -> cost allocation -> order gross-margin snapshot`.
- First, after raw-material inbound confirmation, the system generates a batch/roll number and cost snapshot including supplier, spec, color, width, GSM, meters/weight, CNY/kg price, line amount, inbound date, and manual confirmer.
- Second, raw-material labels are printed and attached to fabric rolls, handle rolls/pieces, and other physical materials. Labels do not show prices, but their codes must point to the backend cost snapshot.
- Third, before order production, scheduling, or replenishment, the cost formula and estimated price generate `rough estimate cost` for quick margin and material planning, not final cost.
- Fourth, during `material issue/outbound mode`, the helper or warehouse user selects machine/task/purpose first, then scans the material label. The system validates width, color, GSM, and material type, then automatically brings the batch inbound price into costing.
- Fifth, after bag-making completion, the worker reports qualified quantity and exception quantity. Leftovers are scanned when they return to warehouse, transfer to another machine, stay across day-end stocktaking, or are large enough to manage.
- Sixth, the system calculates net material use as `issued material - returned leftover - transferred-out material`, then attributes or allocates material cost based on task binding.
- Seventh, each order keeps multiple gross-margin snapshot versions: `estimated margin` before production, `batch-cost margin` after material issue scanning, and `allocated margin` after production reporting and leftover registration. Older versions are preserved for estimate-vs-actual comparison.
- `Estimated margin` is used for order-taking, quotation judgment, and pre-scheduling checks about whether the order roughly makes money. It depends on estimated price or selected supplier price, so it is useful for business decisions and warnings but not final profit.
- `Batch-cost margin` is used after material issue to confirm which supplier, batch, and inbound price were actually used. It mainly corrects rough-estimate variance caused by different supplier or batch prices.
- `Allocated margin` is used after production completion to review material cost closer to the actual result. If one roll serves one task, it can be close to actual; if one roll is shared across orders, replenishment, or rush insertions, it is allocated by machine, task, qualified quantity, formula usage, and leftover records. It is suitable for month-end analysis, order review, machine loss, and material-efficiency analysis.
- Bag body formula:
  - `body required width m = (H*2 + G + F*2) / 100`
  - `body material length m = (W + G + S) / 100`
  - `body cost CNY/piece = body required width m * body material length m * (body GSM / 1000000) * fabric unit price CNY/ton`
- Handle inputs should include handle width, handle length, handle GSM, handle unit price, handle count, and handle supplier / raw-material batch.
- Handle formula: `handle cost CNY/piece = (handle width cm / 100) * (handle length cm / 100) * (handle GSM / 1000000) * handle unit price CNY/ton * handle count`.
- Single-piece material cost = bag body cost + handle cost.
- Single-piece material gross margin excluding labor/electricity = bag sales unit price - single-piece material cost.
- Total material gross margin must show the quantity basis: revenue uses chargeable quantity and the order price snapshot; material cost can use actual produced/delivered quantity, actual material-issue allocation, or estimated quantity, and the UI must mark the result as `actual`, `estimated`, or `machine-allocated`.
- V1 gross margin should first mean `material gross margin` only. It excludes labor, electricity, rent, equipment depreciation, management overhead, and other indirect costs.
- If estimated material gross margin is negative, the system should strongly warn office / management but should not automatically block order entry. If material margin rate is clearly low, show a yellow warning; thresholds can be configured later.
- If an order has free overdelivery / gifted / non-chargeable quantity, revenue uses `chargeable quantity`, while material cost uses actual produced, packed, or delivered quantity.
- Example: ordered 1000 pieces, delivered 1005 pieces, charged 1000 pieces. Revenue uses 1000 pieces, material cost uses 1005 pieces, and the extra 5 pieces reduce margin as free overdelivery cost.
- Stock/common-goods inventory cost in V1 should not force tracing each individual finished bag back to a specific raw-material roll. It can use weighted-average material cost or the latest available cost for the exact inventory key: size/model + color + handle type + finished-goods style.
- When one roll is shared across multiple orders, replenishment tasks, or rush insertions, material cost allocation should prefer `size-based usage formula x actual qualified quantity`, not a simple per-piece average.
- Returned or transferred leftover material should be valued from the original roll cost and remaining weight, meters, or ratio, then subtract from the current machine/task material cost.
- Special models, special machines, or new processes with unconfirmed costing constants should keep orders and production flowing, but their margin should be marked `cost pending confirmation / rough estimate` and not treated as accurate margin.
- Example: for `35*27*10`, W = 35cm, H = 27cm, G = 10cm, fold = 3cm, seam = 2cm, body GSM = 78g, and fabric unit price = 8900 CNY/ton, bag body cost is 0.2283918 CNY/piece.
- Normal/default handle GSM is 60g, and each bag has 2 handles. If an actual handle batch or special order differs, the actual batch/spec snapshot should override the default.
- Handle unit price must also be separated by supplier / inbound batch, and it must not reuse the bag-body fabric supplier price. The body fabric supplier and handle supplier can differ, and cost snapshots should record both separately.
- Example: for handles 5cm wide, 38cm long, 60g GSM, 9000 CNY/ton, and 2 handles, handle cost is 0.02052 CNY/piece.
- In that example, total single-piece material cost is 0.2489118 CNY. At a sales unit price of 0.30 CNY, material gross margin is 0.0510882 CNY/piece, or about 1021.76 CNY for 20000 pieces, excluding labor, electricity, loss, and auxiliary materials.
- Fold is fixed at 3cm and seam is fixed at 2cm for stock/common-goods bags, laminated bags, printed stock/common-goods bags, and non-special custom silk-screen orders. V1 can use these as the default costing constants for those product classes.
- Normal/default handle length is fixed at 38cm, and handle raw-material width is fixed at 5cm.
- The bag body fabric roll width must exactly match the calculated `body required width`. The system must not automatically substitute a wider, near-match, or different-width roll; mismatches should block automatic material matching, replenishment estimates, and cost estimates until manually confirmed.
- If later special models, special machines, or new processes use different constants, the system should support size/style/process-specific maintained constants with version history.
- V1 cost estimates should clearly mark `excluding loss`; loss rate should be added later only after calibration from production reporting, leftovers, abnormal loss records, and stocktaking.
- Raw-material inbound costs are primarily stored as CNY/kg. The costing calculation can convert them to CNY/ton with `CNY/ton = CNY/kg * 1000`.
- Each cost/gross-margin snapshot should store formula version, size inputs, fold/seam constants, bag body and handle GSM, bag-body fabric supplier, handle supplier, material unit prices, material source (actual batch or manual estimate), calculation time, calculator, and whether the result is formal cost, internal estimate, or replenishment guidance.
- Cost snapshots should keep their basis and source separate: rough-estimate price, actual issue batch price, and machine/task allocated price must not be mixed together. The gross-margin page should be able to show both projected margin and actual/allocated margin.
- Cost/gross-margin snapshots should be system-generated and locked as historical records. Later price or source-data corrections should create a new snapshot or variance record, not overwrite the old snapshot.
- When the roll width matches the required body width, rough one-roll output can initially be estimated as `available roll length m / body material length m`, then calibrated from loss, leftover material, actual production reporting, and stocktaking.
- This estimate is still not full financial cost accounting. Formal gross margin should prefer actual material issue, leftover returns, loss, and actual qualified output. When direct binding data is unavailable, use the formula estimate and mark it as estimated.

Current size-to-body-fabric-width table. Actual size is recorded as `width*height*gusset`. Calculations use `body required width cm = height*2 + gusset + 6` and `fabric length cm = width + gusset + 2`:

| Price-table wording | Actual size (width*height*gusset) | Body fabric width | Fabric length |
| --- | --- | ---: | ---: |
| 25*32*10 | 25*32*10 | 80cm | 37cm |
| 30*36*8 | 30*36*8 | 86cm | 40cm |
| 30*38*10 / 30*37*10 | 30*37*10 | 90cm | 42cm |
| 35*41*12 | 35*41*12 | 100cm | 49cm |
| 25*23*8 | 25*23*8 | 60cm | 35cm |
| 26*27*10 | 26*27*10 | 70cm | 38cm |
| 35*27*10 | 35*27*10 | 70cm | 47cm |
| 40*30*10 | 40*30*10 | 76cm | 52cm |
| 40*32*10 | 40*32*10 | 80cm | 52cm |
| 45*37*10 | 45*37*10 | 90cm | 57cm |
| 50*40*12 | 50*40*12 | 98cm | 64cm |
| 小熊25*23*8 | 25*23*8 | 60cm | 35cm |
| 小熊30*27*10 | 30*27*10 | 70cm | 42cm |
| 小熊35*32*10 | 35*32*10 | 80cm | 47cm |
| 小熊小狗40*35*12 | 40*35*12 | 88cm | 54cm |
| 小熊50*40*12 | 50*40*12 | 98cm | 64cm |
| 覆膜30*27*10 | 30*27*10 | 70cm | 42cm |
| 覆膜金银30*27*10 | 30*27*10 | 70cm | 42cm |
| 覆膜32*25*10 | 32*25*10 | 66cm | 44cm |
| 覆膜金银32*25*10 | 32*25*10 | 66cm | 44cm |
| 覆膜40*30*10 | 40*30*10 | 76cm | 52cm |
| 覆膜金银40*30*10 | 40*30*10 | 76cm | 52cm |
| 覆膜45*35*10 | 45*35*10 | 86cm | 57cm |
| 覆膜金银45*35*10 | 45*35*10 | 86cm | 57cm |
| 覆膜50*40*12 | 50*40*12 | 98cm | 64cm |
| 覆膜金银50*40*12 | 50*40*12 | 98cm | 64cm |
| 喜25*30*10 | 25*30*10 | 76cm | 37cm |
| 喜30*37*10 | 30*37*10 | 90cm | 42cm |
| 喜35*41*12 | 35*41*12 | 100cm | 49cm |
| 福25*30*10 | 25*30*10 | 76cm | 37cm |
| 福30*37*10 | 30*37*10 | 90cm | 42cm |
| 福35*41*12 | 35*41*12 | 100cm | 49cm |

Printing step-price grouping:

- manual printing: single-sided content 0.09 CNY/piece, double-sided content 0.13 CNY/piece
- machine printing: 3000 pieces 0.09 CNY/piece, 5000 pieces 0.08 CNY/piece, 10000 pieces and above 0.06 CNY/piece
- split by different print content
- split by different size
- combine only when content and size are the same
- do not split only because print color or bag body color differs

Add-on order merge:

- only same customer, same content, same size
- only before printing or when it can join the same print batch
- use combined quantity to calculate the step unit price

## UX Priorities

- Real operational density, not a marketing page.
- Production supervisor should understand the large TV board without computer skills.
- Office staff should quickly insert orders, adjust sequence, and see risk.
- Mobile screens should be role-limited and simple.
- Important small text must be readable on normal displays and factory-floor screens.

## Current Prototype Gaps

- Frontend only; no backend or persistence.
- Static sample data in `src/App.jsx`.
- No route-level modules yet.
- No real mobile workshop screens yet.
- No real pricing or statement screens yet.
- Production board P1 usability improvements still pending in `ROADMAP.md`.

## QR / Barcode Label Direction

- QR/barcode labels should first land in two small closed loops: outbound / prepared-goods cards, and raw-material inbound / issue / leftover labels. The raw-material label loop should first support more accurate bag costing by connecting inbound cost snapshots, material issue scanning, production reporting, leftover registration, and gross-margin snapshots.
- For outbound / prepared goods, labels should be attached to goods cards, packages, pallets, baskets, or temporary preparation-area markers, not to every individual bag.
- V1/V1.5 should use two separate label templates instead of mixing outbound goods cards and raw-material labels into one template.
- The outbound / prepared-goods card template should show at least: customer name, shipping display name, order tail number / outbound note number, fulfillment method, size/color/handle type/quantity, package count / piece count, package sequence, customer notes, office notes, QR/barcode, and package ID.
- Package labels used for waiting express / less-than-truckload pickup areas must not show pricing / finance information. If outbound, delivery, or pickup documents need prices, those prices belong in the formal document templates, not on express / less-than-truckload package labels.
- Express / less-than-truckload package labels should use small waterproof, tear-resistant label / wash-label-like material where practical, with stapling / hanging as the preferred attachment method.
- Outbound / prepared-goods cards can be used for `pending preparation`, `prepared`, waiting express / less-than-truckload pickup areas, delivery handoff, and pickup handoff.
- During raw-material inbound, fabric rolls, handles, ink, and auxiliary materials can receive batch / roll-number labels.
- Fabric rolls should preferably use one label per roll. Handles should also be labeled by roll/piece when they arrive by roll or piece. If one raw-material supplier delivery-note line contains multiple rolls/pieces, the system should split that inbound line into multiple roll/piece IDs, with one unique QR/barcode per roll/piece.
- Ink and other auxiliary materials can be labeled by barrel, box, package, or batch. V1 should keep them as basic inventory / notes and lightweight labels only; it should not automatically deduct them, allocate them to order-level cost, or build detailed auxiliary-material costing.
- The raw-material label template should show at least: material type, color/specification, supplier, inbound date, roll/batch number, expected meters/weight, warehouse/location, notes, and QR/barcode.
- The raw-material label printer has not been purchased yet. Because raw materials may currently be stored in the yard, raw-material roll/piece labels must be planned as waterproof, moisture-resistant, dirt-resistant, and readable after short outdoor storage. Do not lock the first implementation to ordinary non-waterproof thermal paper. The exact printer model, label size, label material, and attachment method remain pending and should be chosen after physical sample testing on real rolls.
- Raw-material labels should not show purchase unit price, amount, supplier arrears, or other cost/finance data by default. Those fields should be visible only in permission-controlled backend inbound, purchasing-cost, and gross-margin views. The label code must still link to the backend inbound cost snapshot, so material issue scanning can automatically retrieve the batch price.
- In V1, raw-material labels should also be printed by office staff or accounts with print permission after the raw-material inbound document is entered/confirmed. Warehouse staff are responsible for attaching labels, scanning for inbound checks, and later use.
- Raw-material locations should stay coarse in V1, not shelf/layer/bin precise. Recommended locations are `raw-material warehouse`, `workshop temporary storage`, `machine-side`, and `leftover area`, with a note field.
- After raw materials arrive, V1 can first let office staff or a designated person check the raw-material supplier delivery/sales note that arrived with the goods and the physical material information, such as meters, fabric weight/GSM, total kg, color, width, supplier, roll/batch count, and notes.
- Supplier color names on raw-material delivery notes may differ from the factory's standard color names, so the system must not store only one color field.
- Raw-material inbound should store both `supplier original color name` and `factory standard color`. For example, supplier names such as `deep red` or `bright red` can map to the factory standard color `red`. The supplier original name is kept for traceability and supplier reconciliation, while inventory, material preparation, and scheduling matching use the factory standard color by default.
- The system should maintain source-scoped color-alias mappings, not only supplier aliases. It should support factory-internal, customer, customer-group, supplier, and global color names. Suggested fields: source type (factory internal / customer / customer group / supplier / global), source object ID, material/product type, original color name, factory standard color, confidence / confirmed flag, inactive flag, and notes.
- The same original color name may map to different factory standard colors in different source contexts. For example, the factory may call a color `A`, some customers may call it `A`, some customers may call it `B`, supplier 1 may call it `A`, and supplier 2 may call it `C`. The system should resolve aliases by the current context (customer, customer group, supplier, material type), not by global color text alone.
- Recommended auto-recognition priority: current customer / customer-group aliases first, supplier-specific aliases next, then factory-internal / global aliases. If the same color name can match multiple standard colors in the current context, the result must go to manual confirmation.
- OCR/photo recognition should only prefill the supplier original color name and suggest a factory standard color from historical mappings. Customer-group order recognition should likewise only suggest a standard color from customer/customer-group historical aliases. New color names, low-confidence mappings, or ambiguous one-name-to-many-color cases must be manually confirmed by office staff / an authorized account before the material can participate in automatic preparation matching or a formal order.
- V1 color catalogs and alias catalogs should use `manual-confirmation-based learning`, not automatic learning that becomes effective immediately. During order review, customer-group recognition, or raw-material inbound confirmation, the system can prompt `save this as a color alias`, but an office user or authorized account must confirm before it is written to the alias table.
- Every color-alias create/update should record source scenario, original order or inbound document, operator, confirmer, timestamp, and notes, so a one-time recognition mistake does not pollute future color rules.
- It is acceptable for the color catalog to be built gradually. Early missing aliases should route to manual confirmation; later, as customer, customer-group, and supplier names accumulate, automatic recognition accuracy can improve.
- Color aliases and the standard color catalog should separate daily usage permissions from master-data management permissions. Regular office staff can confirm which factory standard color is used for the current order, manual entry, or raw-material inbound, and can create `pending color aliases` or confirm alias learning when permitted.
- Editing existing color aliases, merging two standard colors, deactivating a standard color, changing a standard color name, or changing applicable material types should require management permission, because these actions affect future order recognition, inventory matching, material preparation, scheduling, and statistics.
- When colors are merged, deactivated, or existing aliases are changed, the system must keep an operation log including before/after values, impact-scope prompt, operator, confirmer, timestamp, and reason.
- Historical orders, historical inventory, and historical raw-material records should not be simply overwritten. After color master-data changes, historical records should retain the standard color and original wording used at that time, while reporting can provide aggregated views based on the newer merge relationship.
- Raw-material labels and issue details should show the factory standard color first while retaining the supplier original color name, such as `red (supplier: deep red)`, to avoid shop-floor confusion.
- The system should maintain a unified `standard color catalog / color card` as base master data for order recognition, inventory, material preparation, scheduling, customer statistics, and raw-material color mapping.
- V1 should keep the standard color catalog lightweight. Required fields should include: standard color name, display color swatch, applicable material types, common aliases, inactive flag, and notes.
- The `display color swatch` is only a UI aid to reduce selection mistakes. It is not a strict color-quality or color-matching standard; actual color judgment still depends on physical material, supplier batch, and on-site confirmation.
- Common aliases in the standard color catalog should support customer order recognition and office order entry. For example, if a customer says `deep red`, `bright red`, or `red`, the system can suggest the standard color `red`, but customer-specific aliases should take priority over global common aliases, and low-confidence or ambiguous colors still require manual confirmation.
- Inactive colors should not appear as preferred choices in normal dropdowns, but historical orders, historical inventory, and historical raw-material records must keep them queryable.
- Raw-material purchase cost excludes freight. Freight should not be allocated into the raw-material cost snapshot; if freight needs to be tracked later, it should be recorded as a separate fee item or note.
- The current fabric and handle raw-material supplier delivery/sales-note structure should support photo recognition and manual entry for supplier, raw-material delivery-note number/date, goods name/color, specification model, piece/roll count, total weight in kg, unit price, amount, per-piece/per-roll weight, notes, handler, and receiver.
- The real fabric / nonwoven raw-material delivery/sales-note samples received on 2026-07-04 show common fields such as customer/receiver, document number, document date, goods name or full product name, color, specification model such as `78*70*1500`, `78*90*1300`, and `70*82*2000`, piece/roll count, total weight in kg, unit price, amount, per-roll weight columns, notes, delivery handler, receiver signature, and supplier terms. Recognition and monthly reconciliation should tolerate narrow table layouts, portrait or landscape photos, fingers covering the paper, skewed paper, and supplier template differences.
- In this raw-material section, `delivery note` means the supplier document sent with incoming raw materials. It must not be linked to this factory's finished-goods outbound notes, customer delivery notes, pickup notes, express labels, or less-than-truckload documents.
- Raw-material inbound numbering should have two layers: `supplier original document number` and `ERP internal inbound number`. The supplier number is an external reconciliation clue and source-document reference; if it exists, OCR should prefill it or staff should enter it. If the supplier does not provide one, it must stay blank and be marked as `supplier did not provide a number`; staff should not invent a supplier number just to fill the field. The ERP internal inbound ID, line ID, and roll/piece IDs are mandatory system-owned identifiers for internal search, labeling, scanning, inventory ledger, material issue, and cost traceability.
- When the supplier provides no original document number, reconciliation should not be auto-confirmed by time and quantity alone. Received date/time and piece/roll count are candidate clues only; matching should also use supplier, source photo attachment, specification, color, total weight, per-roll weight, roll sequence, unit price, and amount. Same-day similar deliveries from the same supplier should become low-confidence / manual-review candidates.
- The Baihou supplier Excel statement samples received on 2026-07-04, covering the first and second halves of June, use a single sheet named `对账单` with columns `制单日期`, `单号`, `客户名称`, `商品名称`, `颜色`, `数量`, `重1` to `重5`, `总重`, `单价`, and `金额`. The document date may be text, and amount is a `total weight * unit price` formula. `数量` is roll/piece count, while `重1` to `重5` are per-roll weights, so the importer should split each row into roll-level rows for one-label-per-roll matching. Footer rows may include blank rows, total roll count / amount, `减退货减纸管合计`, historical arrears, and total arrears; these must not be treated as purchase detail rows.
- The Baihou samples show that payable subtotal is not always just detail amount. They include a tube/core deduction such as `116 pieces -> 406` and `99 pieces -> 346.5`, which equals `pieces * 3.5`. The importer should classify this as a supplier-specific reconciliation adjustment and keep the rate configurable instead of applying it to all suppliers. The first V1 rule enables a default Baihou `3.5 CNY / piece` tube/core deduction and should preserve adjustment type, rule, piece count, unit rate, calculated amount, supplier-reported footer amount, and manual-review status. If a footer combines returns and tube/core deduction and the supplier-reported amount differs from the rule amount, the system must flag it for manual split review.
- The Beichen supplier Excel statement sample received on 2026-07-04 contains `每日发货明细` and `每日发货统计` sheets. The first section of `每日发货明细` has columns such as document ID, date, business type, document number, warehouse, customer, invoice type, material code, material name, specification, batch number, unit, piece count, quantity, unit price, and amount. The `批号` column can be used as a supplier roll/batch number for ERP label matching. The same sheet may include a returns section near the bottom with a shifted header layout and no batch number, so the importer should parse by detected section headers rather than fixed column positions. `每日发货统计` is a daily validation summary, not a replacement for line-level reconciliation.
- Fabric and handle raw materials are purchased primarily by `kg/weight`. The delivery note's `quantity` can be treated as total kg, `unit price` as price per kg, and `amount = total kg x unit price`. Width, GSM/fabric weight, and meters in the specification model should feed production material estimates, labels, and later gross-margin calculations.
- Handle width is usually `5cm`, while main fabric roll widths are usually two-digit centimeter widths, such as `78cm`. Specification parsing must distinguish `material type = handle` from `material type = fabric`, so a small width value is not incorrectly treated as an abnormal fabric specification.
- Handle labels and issue details should explicitly show `handle`, color, `5cm` width, GSM/specification, weight, and roll/batch number to avoid confusion with main fabric rolls.
- Example: a line such as `red 78*90g*1500`, `2 pieces`, `212.4kg`, `9 yuan/kg`, `1911.6 yuan` should allow the system to also keep the two per-piece weights, such as `105.4kg` and `107kg`, for roll/piece labeling and later material issue.
- The raw-material inbound document should save a cost snapshot: ERP raw-material inbound number, supplier, optional supplier original document number (enter it when present; do not invent one when absent), document date, line number, material type, supplier original color name, factory standard color, specification model, piece/roll count, per-roll/per-piece weight, total kg, pricing unit, purchase unit price, line amount, freight-included flag, original photo/OCR result, manual confirmer, and confirmation time.
- The first raw-material inbound workflow is fixed as: receive the raw-material supplier delivery/sales note that arrives with the goods, upload a phone photo, let OCR/recognition create a raw-material inbound draft, have customer-service / office receiving staff compare the raw-material note, recognition result, and physical supplier label, split the line into one system roll/piece ID per roll/piece, print one label per roll/piece, attach each label to the matching material roll, then use a phone scan / confirmation upload of signed-note information before the inbound document or roll is considered fully registered.
- Label printing is only a `pending label attachment` state. It does not complete inbound. After the physical label is attached, the label must be scanned by phone or scanner, or confirmed with a photo/signed-note upload, recording attachment confirmer, confirmation time, warehouse or temporary location, and signing evidence before the roll can become `labeled inbound / available`.
- If a raw-material supplier delivery-note line provides roll/piece count and per-roll weight columns, the system should prefer those per-roll weights when generating labels. If per-roll weights are missing, the system may generate estimated labels from total weight divided by roll count, but the labels and records should be marked `per-roll weight pending review` and must not treat estimated weight as actual weighed weight.
- Suggested raw-material inbound states are: `photo uploaded pending recognition`, `recognized pending review`, `pending completion / pending confirmation`, `reviewed pending label print`, `printed pending attachment`, `partially attached`, `labeled inbound / available`, `inbound exception / pending confirmation`, and `voided / rebuilt`.
- Office staff can enter raw-material inbound documents. After confirmation, kg unit price, purchase unit price, amount, and cost-snapshot fields can be changed only by accounts with purchasing / cost / raw-material-price permission or through a correction workflow.
- Ordinary label-attachment, inbound-scan, and helper material-issue accounts cannot change confirmed inbound prices.
- Once an inbound cost snapshot is referenced by material issue, costing, or reconciliation, it should not be silently overwritten. If price or quantity was entered incorrectly, the system should use an inbound correction/adjustment record that preserves old value, new value, reason, operator, and time.
- At the beginning of the following month, when the raw-material supplier sends a fabric / handle monthly statement, the system should support uploading an Excel / table file and matching it against ERP-confirmed raw-material inbound records by supplier, month, ERP raw-material inbound ID, optional supplier raw-material delivery-note number, document date, line number, color, specification, piece/roll count, total kg, unit price, and amount.
- Monthly supplier statement import should first normalize each supplier template into a common structure: supplier, reconciliation period, source file, sheet, source row number, document date, optional supplier original document number, matched ERP inbound ID, customer/receiver, material name, supplier original color, factory standard color, specification model, material type, roll/piece count, roll sequence, supplier batch/roll number, per-roll weight, total kg, unit price, amount, adjustment type, and raw-row JSON.
- Baihou-style sheets should split `重1` to `重5` into roll-level statement rows. Beichen-style sheets should prefer `批号` as the roll-level match key. The system should retain source row and split roll sequence for manual audit back to the supplier workbook.
- Recommended automatic matching priority is: supplier + supplier batch/roll number; then supplier + supplier original document number + line/roll sequence; if the supplier did not provide a document number, use ERP inbound ID / source photo attachment plus supplier + received date/time + specification + color + piece/roll count + per-roll weight + roll sequence as a candidate; then supplier + document date + specification + color + total/per-roll weight + unit price/amount; lastly total weight / amount as low-confidence candidates. Low-confidence candidates may be suggested but must not be auto-confirmed.
- Supplier monthly reconciliation results should distinguish: fully matched, ERP inbound exists but supplier omitted it, supplier row exists but ERP has no confirmed inbound, specification/color/GSM/width/meter mismatch, weight/quantity mismatch, unit-price mismatch, amount mismatch, and possible duplicate rows. Difference rows should be highlighted in red or yellow and require manual handling notes.
- Reconciliation adjustments should be shown separately, such as returns, tube/core deductions, supplier historical arrears, current-period payable subtotal, and total arrears. Only current-period purchases, returns, and deduction items participate in the current-period reconciliation; historical arrears and total arrears are reference balances and should not overwrite current inbound cost. Adjustment records should preserve structured fields such as `adjustmentType`, `isCurrentPeriod`, `amount`, `supplierReportedAmount`, `calculatedAmount`, and `calculationBasis`; historical arrears / balances must be marked `isCurrentPeriod=false`.
- Supplier reconciliation confirmation is not payment. The first V1 formal confirmation should only allow a manually reviewed consistent supplier statement draft to receive an `RMSRC-*` reconciliation confirmation id, move to `statement confirmed / pending payment`, and set payment status to `pending finance payment confirmation`. This confirmation may act as purchasing reconciliation evidence and later cost-basis input, but it must not create usable inventory, must not directly create payment, and must not bypass supplier deduction / tube-core rules or finance review.
- The first V1 supplier payable draft must be generated separately by a finance / management account from an already confirmed reconciliation record. It receives an `RMSP-*` payable draft id and status `pending finance review`. The draft amount is current-period statement line subtotal plus current-period adjustments; historical arrears, total balances, and opening balances remain reference adjustments and must not be silently included in the current-period payable draft. Payable draft generation should prefer structured `isCurrentPeriod=false` / `reference_balance` markers over footer-text guessing when excluding historical balances.
- The first V1 supplier payment confirmation must be a separate finance / management action based on an existing `RMSP-*` payable draft. It receives an `RMSPAY-*` payment confirmation id and records paid amount, method, bank reference / voucher, confirmer, and confirmation time. V1 requires the paid amount to equal the payable draft amount; partial payments, multiple payments, prepayments, payable aging, and complex variance carry-forward stay out of this first version. Payment confirmation updates supplier statement / payable payment status and operation logs only; it must not write raw-material inventory or customer statement payment records.
- Payment entry, payment confirmation, variance handling, and management watch must use separate permissions and operation logs. Excel upload, manual review, reconciliation confirmation, or payable-draft generation must never implicitly create payment records.
- The system can support photo recognition of the raw-material supplier delivery/sales note or material packaging/label to prefill a raw-material inbound draft. OCR/recognition results are only prefill data; an authorized account must manually verify and confirm them before the system creates an official raw-material batch / roll number.
- If OCR fails, is unclear, or misses key fields, the inbound draft enters `pending completion / pending confirmation` and must not create available raw-material inventory.
- After manual confirmation, the system generates the raw-material batch / roll number and label template. Office staff or an account with print permission prints the sticker and attaches it to the corresponding raw material.
- After the sticker is attached, scanning the label with a scanner or phone records label-confirmation operator, time, warehouse/location or temporary position, and marks that roll/batch as `labeled inbound / available`.
- If the raw-material supplier delivery note, recognition result, and physical material do not match, such as color, width, GSM, meters, or total kg mismatch, the item should enter `inbound exception / pending confirmation` and must not become available material directly.
- Scanning during inbound should quickly open the inbound document / raw-material batch and help confirm quantity, location, supplier, and specification.
- Raw-material inventory should have its own ledger, including at least `inbound`, `machine-side material pickup / material issue`, `return / leftover registration`, and `stock adjustment`. `Machine-side material pickup / material issue` means issuing material to a production machine, not customer shipment.
- Scanning during material issue/outbound should record which roll/batch is issued to which machine, production task group, or purpose, including receiver, issuer, time, quantity / full-roll or partial issue, and notes.
- After material issue/outbound scanning succeeds, the system should bring that raw-material batch's inbound cost snapshot into the related machine, task, order, or replenishment material-cost calculation. For full-roll issue, the full roll cost first enters the machine/task material pool; for partial issue, record issued weight/meters/ratio and calculate cost from the batch unit price.
- V1 should default raw-material issue to full-roll / full-piece movement to machine-side. Partial issue quantity is required only when the roll is actually split, weighed, metered, or a remaining ratio is clearly known.
- The current implementation has first V1 follow-up actions for `confirm consumption`, `return leftover`, and `review leftover`. Only machine-side issued rolls / pieces can be consumed or returned, and only pending-leftover rolls / pieces can be reviewed. Full-roll / full-piece consumption creates an `RMI-CONS-*` record and moves the roll / piece to consumed; measured partial consumption by weight records the consumed weight, keeps the child roll at machine side with the remaining weight, and marks it as `partial consumption / machine-side` until the rest is consumed or returned; leftover return creates an `RMI-RET-*` record and moves the roll / piece to pending leftover review; leftover review creates an `RMI-LREV-*` record and moves the roll / piece back to available raw-material inventory. These actions are traceability and inventory-state transitions only: they do not create finished-goods output, do not treat machine counters as qualified quantity, and do not allocate cost / margin.
- The current implementation also has the first V1 `generate cost draft` action. Only finance / management permissions may create `RMCA-*` raw-material cost-allocation drafts, and only from confirmed consumption records whose issue record is already matched to a production task. Unlinked production tasks, missing inbound unit price, missing consumption, and duplicate draft generation are blocking cases. The draft uses the inbound unit-price snapshot and consumed weight / quantity, links back to the issue and consumption records, and remains `draft_only`: it does not confirm final order cost, does not calibrate loss, and does not update order margin reports.
- The current implementation also has the first V1 `confirm cost draft` action. Only finance / management permissions may confirm existing `RMCA-*` drafts; missing drafts and duplicate confirmations are blocking cases. Confirmation creates an `RMCC-*` raw-material cost confirmation record, updates the inbound, issue records, consumption records, and drafts to reviewed / pending loss calibration, and records `confirmed_material_cost_snapshot` as the material-cost effect. It still does not calibrate loss, does not update order margin reports, and does not treat machine cycle counts as qualified output.
- The current implementation also has the first V1 `calibrate loss` action. Only finance / management permissions may calibrate existing `RMCC-*` confirmations; missing confirmations and duplicate calibration are blocking cases. Calibration creates an `RMCL-*` raw-material loss-calibration record, records expected output, actual qualified output, loss quantity, loss rate, related drafts / issue / consumption / production tasks, and moves the inbound, drafts, confirmations, issue records, and consumption records to loss-calibrated / pending margin confirmation. It records `loss_calibrated_material_cost_snapshot` as the material-cost effect and `pending_margin_snapshot` as the margin effect, but still does not update final order margin reports and does not treat machine cycle counts as qualified output.
- The current implementation also has the first V1 `generate margin snapshot` action. Only finance / management permissions may generate `RMMG-*` raw-material order-margin snapshots, and only after an `RMCL-*` loss calibration exists. Missing loss calibration, missing order-line links, and duplicate snapshot generation are blocking cases. The snapshot summarizes linked order-line sales amount, loss-calibrated material cost, gross profit amount, and gross margin rate, then moves the inbound, drafts, confirmations, loss calibrations, issue records, and consumption records to margin-snapshot pending finance review. If order sales amount is missing, the system records a warning instead of fabricating revenue. This snapshot does not write customer statements, does not confirm final financial settlement, and does not treat machine cycle counts as qualified output.
- The current implementation also has the first V1 `review margin snapshot` action. Only finance / management permissions may review existing `RMMG-*` snapshots, and only when linked order revenue is complete. Missing margin snapshots, missing order revenue, and duplicate reviews are blocking cases. Review creates an `RMMR-*` internal margin report, moves the inbound, drafts, confirmations, loss calibrations, issue records, consumption records, and margin snapshots to margin-report-ready status, and records `reviewed_margin_report_snapshot` as the margin effect. This report is an internal finance margin report only: it does not write customer statements, does not register collection or final customer settlement, and does not treat machine cycle counts as qualified output.
- Scanning any raw-material label must not automatically mean material issue/outbound. The scanner or phone must be in `material issue/outbound mode`, or a production task / material issue document / machine issue page must already be open, before scanning can create a material issue record.
- Recommended issue scanning flow is completed by the helper: first select machine, that machine's daily task group, or issue purpose; then scan the raw-material roll/batch code; the system validates color, specification, width, and other matching fields; it defaults to moving the full roll to machine-side material, asks for partial issue quantity when needed, and then the helper confirms `machine-side material pickup`.
- Bag-making workers do not need to scan-confirm material issue again. The system can show issued raw materials in their task detail for review and exception discovery.
- Every raw-material issue/outbound record must be bound to a specific machine. For customer orders, replenishment, or mixed production, it should also be bound as much as possible to the production task / work order / replenishment task / order line.
- Machine binding is mandatory in V1. Production-task / order-line binding is the finer cost-attribution field and should be captured when practical, but the system should not force real-time material switching for every small order.
- If material is linked only to a machine and that machine's day/batch task group, it can still enter machine-level material accounting. Order/task gross margin should first be allocated as an `estimate` from actual qualified output, size-based material formulas, and machine task allocation, not treated as final financial cost settlement.
- After production reporting is completed, the system should link `raw-material issue - leftover return - loss/exception` with `actual qualified output by machine`, creating the data foundation for machine material efficiency and task/order gross margin.
- Example: `R001 red fabric roll` is issued to `machine 1 / 30*38 red replenishment task`; the task reports `3000 qualified pieces` and `0 leftover returned`, so the system can calculate this machine task's one-roll output, loss, and estimated gross margin.
- If one roll is used across multiple small orders, rush insertions, and replenishment tasks, V1 should not force per-order segmented scanning on site. The system can first estimate allocation by machine, date/shift, size/color, actual qualified output, and material-usage formula, and mark the result as `estimated`.
- Later, if the shop-floor process can tolerate finer operation, the system can add optional task-segmented usage, such as first binding to `customer order A 500 pcs`, then binding to `30*38 red replenishment 2500 pcs`.
- Order gross margin should prefer actual raw-material issue and leftover records directly linked to that order / order line. If direct linkage is unavailable, it can first use size-based material formulas, machine-task allocation, and raw-material batch cost for estimation, but should not treat that as final financial cost settlement.
- If no production task, machine, or issue purpose is selected, scanning the raw-material label should only open material details and inventory status, without deducting inventory.
- If a full roll is issued and later has leftover material, V1 should require return / leftover registration only when the leftover returns to a warehouse/location, moves to another machine, is checked during end-of-day / stage stocktaking, is large enough to manage separately, or office / production supervisor requests it. The record should include original roll/batch, original machine, current location, remaining meters/weight/roll fraction, status, recorder, time, and reusable specification.
- If leftover material stays beside the original machine across days, the system should keep it as `machine-side material` and show it as `yesterday's machine-side leftover` on the next day's task view. Its inventory location and ledger should change only when it is returned, moved to another machine, or adjusted through stocktaking.
- Raw-material inbound, issue/outbound, and leftover records should later link to production tasks, so material consumption, leftover tracking, and gross-profit estimation have better data.
- V1 should support USB / Bluetooth scanner keyboard-input mode and mobile scanning first. It should not require dedicated PDA devices. A scanner can input an internal ID, while mobile scanning remains a fallback.
- QR/barcodes must not replace human verification of specification, color, and quantity. Scanning should help with quick lookup, fewer picking mistakes, and operation traceability.

## V1 Acceptance Test Scenarios

V1 must pass at least the following acceptance scenarios before launch. These scenarios verify that pages, states, permissions, API/database boundaries, printing, inventory, fulfillment, statements, and payments work as one flow.

- Order recognition entry: test both `manual full-text entry` and `customer-message paste recognition`, creating one original order with multiple order lines while preserving source text, source context, parsed result, and review record.
- In-stock stock/common-goods order: test `30*38 red 500 pcs` recognition, inventory lookup, final inventory recheck, inventory reservation, and transition into `waiting outbound`.
- Out-of-stock stock/common-goods order: test one customer placing multiple small stock lines, where in-stock lines enter `waiting outbound`, out-of-stock lines enter `waiting customer confirmation / waiting replenishment`, and different lines under the same original order flow independently.
- Custom printed order full flow: test order entry, silk-screen setup photo upload, silk-screen quantity reporting, bag-making finished-goods photo upload, package packing, fulfillment, and statement generation.
- Quantity variance: test original order `1000`, actual delivery `1005`, chargeable quantity `1000` as gift / non-chargeable overdelivery; also test original order `1000`, actual `980`, with office choosing actual-quantity billing or allowance handling.
- Pickup / delivery note change and reprint: test quantity shortage found before pickup or driver loading, office confirms the customer accepts actual quantity, old outbound / pickup / delivery note is voided, the new dot-matrix note is reprinted, and order, inventory, delivery, and statement records stay unambiguous.
- Express / less-than-truckload labels: test packing into multiple packages, package label printing, movement into waiting pickup area, next-day confirmation of partial or full carrier pickup, and only picked-up packages deducting inventory and entering delivery / statement records.
- Statement and payment variance: test statement generation by actual delivery date, customer underpayment entering `variance pending confirmation`, office choosing rounding/write-off or unpaid balance, and unpaid balance becoming customer debt that can be carried into the next statement.
- Raw-material inbound labeling: test supplier delivery-note phone photo upload, OCR prefill, customer-service / office review, one-label-per-roll printing, physical label attachment, phone scan / signed-note upload, and only confirmed attached rolls becoming available raw-material inventory.
- Supplier monthly reconciliation: test uploading a fabric supplier statement Excel at the start of the following month, matching it against ERP-confirmed inbound records by delivery note, date, color, specification, weight, unit price, and amount, and highlighting missing ERP inbound, supplier omissions, specification differences, weight differences, unit-price differences, and amount differences.

Acceptance tests should keep test data, operator account, expected result, and actual result. Failed scenarios should enter a fix list instead of being treated as launch-ready.

## Open On-Site Verification

- Ounuo bag-making counter semantics are confirmed: the machine screen's output / count is a machine action or cycle count, not final qualified finished-goods quantity.
- Still verify per machine whether it exposes both daily machine count and lifetime cumulative count.
- Still verify per machine whether counters are reset daily or remain cumulative.
- If counters are cumulative, daily process count should be calculated as `current end-of-day reading - previous end-of-day reading`.
- If machines provide a daily machine count, record that value directly while retaining photo/manual-entry evidence.
- The first bag cost formula has been provided in `docs/product/assets/bag-cost-calculation-2026-06-28.xlsx`; implementation should model it as configurable rules rather than hard-coding hidden constants.
- Fold = 3cm and seam = 2cm are confirmed for stock/common-goods bags, laminated bags, printed stock/common-goods bags, and non-special custom silk-screen orders. Normal/default handle length is fixed at 38cm and handle raw-material width is fixed at 5cm.
- Body fabric roll width must exactly match the calculated body required width; V1 cost estimates should be marked `excluding loss`; special models should use the machine-capability table's `other special models` or a manual flag to require constant confirmation. Still verify whether special models or new processes use different constants.
- Until exact roll length and full usage formulas are available, raw material can default to a rough estimate of `1500 meters per roll`.
- Early replenishment suggestions can use a rough `one-roll` estimate, such as estimating how many pieces one roll can produce, whether the shortage is close to one roll, and whether arranging a full roll is worthwhile.
- `1500 meters per roll` is not precise. It should only support early estimates for production material usage, material cost, and gross profit, not final financial cost settlement.
- If actual roll length, actual material input, leftover material, or material unit cost becomes available later, the system should support replacing or calibrating the rough estimate with actual data.
- Gross-profit estimation should at least separate revenue and cost sources: bag / print revenue comes from the order price snapshot, while material cost comes from size-based material usage, roll-length estimate, material unit cost, and actual or estimated material usage.
- Fabric and handle raw-material purchasing is confirmed to be primarily priced by `kg/weight`, with inbound cost snapshots saved by yuan/kg. Production material estimates and replenishment still need to combine that cost with material type, width, GSM/fabric weight, meters in the specification model, and later size-based usage formulas.
- Ink and other auxiliary materials should not have automatic deduction or order-level cost allocation in V1. If they later need detailed management, confirm their purchasing units separately; the system fields should support kg, meter, roll/piece, box/barrel, or batch pricing bases.
- Still collect real label-paper / label-printer dimensions, phone label-attachment confirmation habits, supplier monthly statement Excel samples, and variance-tolerance thresholds before implementation is treated as field-ready.
