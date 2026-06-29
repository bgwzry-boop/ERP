# Legacy Thread Timeline

This file preserves the old thread in chronological project terms. It is not a verbatim UI transcript; repeated interrupted messages and large binary image payloads were removed.

## 1. Initial Scope

The user wanted to build a small/medium factory ERP containing inventory in/out and finance reconciliation.

Initial assistant direction:

- Product Design plugin workflow.
- Start with product brief.
- Ask whether V1 includes only inventory and finance, or also purchasing, sales orders, production work orders, suppliers/customers, approval, reports.
- Suggested manufacturing back-office style: left navigation, top search, dense tables, status tags, document flows.

## 2. First V1 Compression

The scope was first compressed to:

- inventory in/out
- inventory ledger
- finance reconciliation
- boss, warehouse, finance roles

Production, BOM, scheduling, quality, and advanced costing were deferred in that earliest plan.

This was later superseded after the user clarified online/offline and production needs.

## 3. Jushuitan Reference

The user said Jushuitan SaaS ERP was similar to the desired system.

The assistant browsed public references and summarized:

- Jushuitan is more e-commerce SaaS ERP
- useful references are information density, module navigation, table filtering, document flows
- should not copy brand or proprietary UI

Plan created:

- high-density SaaS ERP architecture
- inventory, documents, finance reconciliation, reports
- production and platform integration initially deferred

This was also later superseded by factory-production requirements.

## 4. Online + Offline + Production

The user clarified:

- offline and online both exist
- offline is customer pickup
- online is self-run online shop
- factory production must also be included

The ERP scope became:

`sales/order -> inventory allocation -> production replenishment -> finished goods inbound -> online shipping/offline pickup -> payment reconciliation`

Important modeling decisions:

- online orders via self-run shop API
- offline orders entered manually
- channel inventory for online/offline
- stock/common goods plus custom printed orders
- raw roll material bought by kg
- production material consumed by meters
- goods sold by pieces
- material master needs conversion factors and loss rate
- workshop leftover material ledger is required

## 5. V1 Plan Implemented As Product Brief

The user asked to implement a plan for:

- online/offline integrated ERP
- factory production
- inventory allocation
- scheduling
- issue material / leftover material
- completion inbound
- shipping/pickup
- payment reconciliation

Assumptions:

- Web ERP first
- Jushuitan only as density/reference
- semi-automatic suggestions with manual scheduling
- rough cost only
- simple quality/loss recording

## 6. Visual Direction Generation

Three visual directions were generated:

1. Production scheduling command center.
2. Order and inventory linkage desk.
3. Boss business cockpit.

The assistant recommended direction 1 because it best distinguished this product from ordinary inventory/e-commerce ERP.

## 7. Small Fragmented Orders Changed The Interface

The user clarified:

- many orders are small fragmented orders
- not one order occupying a machine for one day or several days
- 4 silk-screen machines
- 9 bag-making machines

The UI direction changed from long Gantt bars to:

- small-order pool
- batch suggestions
- machine short queues
- quick rush-order insertion
- changeover/setup cost visibility

Three new directions were generated:

1. Small-order batching scheduling desk.
2. Dual-workshop short queue board.
3. Small-order flow cockpit.

The assistant recommended direction 2 as the first main interface, with direction 1's batching suggestions on the left/detail panel.

## 8. Prototype Implementation

The user accepted direction 2.

Implemented:

- standalone Vite + React prototype
- dark left module navigation
- top sync/status bar
- KPI row
- batching suggestion panel
- 4 silk-screen machine rows
- 9 bag-making machine rows
- short job chips
- selected machine/job detail panel
- date and workshop filters
- risk filtering
- select task
- reorder queue
- insert rush order
- merge batch
- transfer machine
- completion registration modal
- material and leftover suggestions

QA:

- build passed
- desktop screenshot checked at 1440 x 1024
- narrow desktop checked at 1280 x 900
- right panel hidden at narrower width to prevent clipping
- final QA marked passed in `design-qa.md`

## 9. Design Audit

The user said they could not tell whether the page had problems.

The assistant audited the prototype and identified:

- the direction was usable, not wrong
- KPI area was too tall
- batching panel took horizontal space
- job chips had too much text
- S2 bottleneck row needed more emphasis
- right detail panel had weak action guidance
- narrow desktop hid actions when right panel disappeared
- small text had readability risk

Recommended P1 changes:

- compact KPI status strip
- collapsible batching suggestion panel
- simpler job chips
- stronger bottleneck row
- selected-job recommendation area
- narrow-desktop bottom action bar
- increase key small text where density allows

## 10. Discovery Method Decision

The user asked whether more real situations would make the system closer to factory usage.

Decision:

- yes, but prioritize real daily exceptions
- do not overbuild edge modules too early
- continue one question at a time

High-value discovery areas:

- small-order batching
- leftover rolls
- silk-screen and bag-making bottlenecks
- rush orders
- what can be grouped
- real operator actions
- finance needs

## 11. Roles And Production Board

The user clarified:

- production board mainly involves boss, production supervisor, and scheduler
- production supervisor is not comfortable using computers
- two office staff handle order entry and scheduling
- scheduling data should be projected to a big TV

Big TV board idea:

- like hospital queue system
- each machine has a queue
- shows scheduled orders, order sequence, estimated duration, machine status, order progress
- office manually inserts rush orders and corrects sequence

## 12. Order Flows

The user defined four order flows:

1. Custom printed order:
   `已接单 -> 待排产 -> 已排产 -> 丝印中 -> 待制袋 -> 制袋中 -> 待发货/自提 -> 已完成`

2. Non-printed with stock:
   `已接单 -> 出库 -> 装包 -> 送货/自提 -> 已完成`

3. Non-printed without stock:
   `已接单 -> 待排产 -> 已排产 -> 制袋中 -> 装包 -> 送货/自提 -> 已完成`

4. External processing printing order:
   `已接单 -> 待排产 -> 已排产 -> 丝印中 -> 送货 -> 已完成`

## 13. Scheduling Rules

The user explained:

- 4 silk-screen machines
- silk-screen prioritizes delivery time
- then keeps same print color close where possible
- usually today's orders only
- 4 silk-screen machines can coordinate internally
- bag-making uses model/size and machine ownership
- mold change takes 1-2 hours
- mold changes should happen at lunch or after work
- long day shift

## 14. Bag-Making Machine Capabilities

The user listed the capability of all 9 bag-making machines. This is copied into `legacy-thread-context.md` and `docs/product/requirements.md`.

## 15. Tomorrow Planning Rhythm

The user clarified:

- generally schedule tomorrow's orders
- try to keep one machine to one model
- previous process had no order statistics, causing missed delivery times and forced same-day mold changes
- 16:00 count tomorrow's orders
- before 17:00 confirm tomorrow's machine model
- shift is 07:30 to 19:30
- except silk-screen machines, workers rest 1 hour at lunch

## 16. Mobile Workshop Ports

The user wanted the system split for:

- boss and office on desktop
- workshop mobile ports
- silk-screen workshop
- bag-making workshop
- miscellaneous/packing workers

Each workshop only sees its own dispatch orders.

They report:

- print finished photos
- bag-making finished photos
- print quantity
- bag-making final quantity
- package count
- quantity per package

Goal: avoid unclear order state after work when loading goods.

The user later confirmed reports should auto-flow to the next step without office confirmation.

## 17. Quantity And Packing Rules

The user clarified:

- production often does slightly more than ordered
- 1000 ordered may become 1020 after print, 1005 after bag-making
- extra usually goes to customer
- short quantity needs exception, generally no automatic make-up order
- under 5000 pieces: extra up to 50 normal
- 5000 or above: extra up to 100 normal

Packing:

- not just `packed`
- record package details
- typical 1000 pieces: 1x1000 or 500+500
- if actual 1010: 500+510
- sea freight/transfer warehouse may require per-package weight, such as max 15 kg

## 18. Delivery, Pickup, Express

The user clarified:

- delivery needs delivery note and driver watermarked photo at customer location
- driver should have a port to upload photos tied to order
- pickup needs outbound note and customer signature
- order completion differs:
  - pickup: customer signature
  - express: carrier picked up
  - delivery: watermarked location photo required

Express/less-than-truckload:

- no complex tracking in V1
- self-run online shop API may later fetch label records
- customer orders often wait for customer to arrange carrier after completion

## 19. Order Fields And Customer Statistics

The user listed important order fields:

- customer name
- online/offline source
- product name / print content note
- size
- color
- whether printed
- print color
- quantity
- latest delivery time
- fulfillment method
- customer notes

The assistant recommended separating order source and fulfillment method.

Order sources finalized:

- offline local customers
- self-run online shop
- peer/factory processing

Product style and print plate saving is mainly for statistics, not fast reuse.

Statistics desired:

- customer monthly order amount
- sizes ordered
- printed order ratio
- plus suggested dimensions such as rush-order and exception counts

## 20. Finance And Statements

The user clarified:

- some customers settle immediately
- some settle periodically: 5 days, 7 days, next month start
- periodic customers require statements sent to customers for checking before settlement

Statement generation:

- filter by customer
- choose date range
- include completed orders
- export/send to customer
- customer checks
- then payment is recorded

Recommended statement states and evidence links are copied into `legacy-thread-context.md`.

## 21. Pricing

The user described:

- bag prices are by size
- default price table exists
- printed orders add print step pricing
- silk-screen print prices:
  - below 2000: 0.12
  - 2000-4900: 0.09
  - 4910-9050: 0.08
  - 10000+: 0.06
- `加长提` means use the `加长提` column instead of the normal price

Later refinements:

- bag price tables can be 1, 2, 3, etc.
- print step price tables also can be 1, 2, 3, etc.
- customer defaults to table 1, can manually link to another table
- order saves price snapshot
- manual price override is allowed for current order only
- no boss approval for now
- order must clearly show when price differs from linked price table so finance can reconcile

## 22. Final Context Compression

At the end of the old thread, the user said the conversation was lagging and asked to compress context.

The assistant produced a compressed fact sheet. That content has been merged into:

- `legacy-thread-context.md`
- `docs/product/requirements.md`

