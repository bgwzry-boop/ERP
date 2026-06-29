# Legacy Thread Context

This is the working context migrated from the old thread `设计中小工厂ERP系统`.

## Product Positioning

Build an ERP for a small/medium packaging factory that combines:

- self-run online shop orders
- offline local customer orders
- peer/factory processing orders
- inventory and channel stock
- silk-screen printing production
- bag-making production
- packing, delivery, pickup, and express/less-than-truckload handoff
- customer reconciliation and payment tracking

Jushuitan was used only as a reference for dense SaaS ERP information architecture, table-heavy operations, filtering, document flows, and back-office feel. The product should not copy Jushuitan's brand, proprietary UI, or full e-commerce platform scope.

## Current Prototype

The current code implements a frontend-only production board prototype:

- React + Vite
- 4 silk-screen machines
- 9 bag-making machines
- short queues for many small fragmented orders
- batching suggestions
- rush-order insertion
- queue reorder
- machine transfer
- completion registration modal
- leftover-material and material suggestion details

The selected visual direction was:

- primary: `双车间短队列看板`
- merged feature: direction 1's `合批建议`

Reason: orders are mostly small fragmented jobs, not one job occupying one machine for a full day or several days.

## Roles

- Boss: full permissions.
- Office staff: two office users handle order entry, scheduling, rush-order insertion, queue adjustment, finance/reconciliation support.
- Production supervisor: not comfortable with computers, mainly watches a large TV production board.
- Silk-screen workshop mobile side: sees only assigned silk-screen dispatch/work orders; reports print completion, quantity, photos, and exceptions.
- Bag-making workshop mobile side: sees only assigned bag-making dispatch/work orders; reports completion quantity, photos, loss, and leftover material.
- Packing workers mobile side: sees only orders waiting for packing; fills package count, quantity per package, optional weight, and notes.
- Driver mobile side: sees delivery tasks and uploads timestamp/location-watermarked delivery photos.

## Order Sources

- Offline local customers: nearby local village and surrounding e-commerce sellers.
- Self-run online shop.
- Peer/factory processing.

Use two separate concepts:

- Order source: where the order came from.
- Delivery/fulfillment method: how the order leaves the factory.

## Core Order Fields

- Customer name
- Order source
- Product name: usually print content or an internal note name
- Product size
- Bag color
- Whether it needs printing
- Print color
- Quantity
- Latest delivery/shipping time
- Fulfillment method: delivery, customer pickup, express/less-than-truckload
- Customer remarks

## Order Workflows

### Custom Printed Order

`已接单 -> 待排产 -> 已排产 -> 丝印中 -> 待制袋 -> 制袋中 -> 待发货/自提 -> 已完成`

### Non-Printed Order With Stock

`已接单 -> 出库 -> 装包 -> 送货/自提 -> 已完成`

### Non-Printed Order Without Stock

`已接单 -> 待排产 -> 已排产 -> 制袋中 -> 装包 -> 送货/自提 -> 已完成`

### External Processing Printing Order

`已接单 -> 待排产 -> 已排产 -> 丝印中 -> 送货 -> 已完成`

## Production Board

The large TV board should work like a hospital queue/call system:

- one queue per machine
- scheduled orders
- order sequence
- estimated duration
- machine state
- order progress
- visible bottlenecks
- clear next task

Temporary rush orders are inserted manually by office staff, and the queue order is corrected manually.

## Scheduling Rules

### Silk-Screen Workshop

- 4 silk-screen machines.
- Priority is latest delivery/shipping time.
- Within similar urgency, group same print colors near each other.
- Changeover/setup time matters.
- Usually only today's orders are sent to the silk-screen workshop.
- The 4 silk-screen machines can adjust their own execution sequence internally.

### Bag-Making Workshop

- 9 bag-making machines.
- Core scheduling axis is size/model and machine capability, not only color.
- Mold change takes about 1-2 hours.
- Mold changes should be scheduled at lunch or after work where possible.
- Avoid daytime mold changes that disrupt production.
- The system must warn earlier when a soon-due order would force a same-day mold change.
- Normal target: one machine mostly runs one model per day.

### Work Hours

- Long day shift: 07:30 to 19:30.
- Except for the 4 silk-screen machines, other workers rest 1 hour at lunch.
- Tentative daily planning rhythm:
  - 16:00: count tomorrow's orders
  - before 17:00: confirm tomorrow's bag-making machine models

## Bag-Making Machine Capability Table

- Machine 1: 30x38x10 cm vertical
- Machine 2: 40x30x10 cm horizontal, 40x32x10 cm horizontal
- Machine 3: 35x27x10 cm horizontal
- Machine 4: 25x32x10 cm vertical, 35x41x12 cm vertical, 50x40x12 cm horizontal
- Machine 5: 25x32x10 cm vertical
- Machine 6: 30x38x10 cm vertical, 25x32x10 cm vertical, 40x32x10 cm horizontal, other special models
- Machine 7: 30x38x10 cm vertical, 25x32x10 cm vertical
- Machine 8: 30x36x8 cm vertical, 35x27x10 cm horizontal, 35x41x12 cm vertical, other special models
- Machine 9: 30x38x10 cm, 30x36x8 cm, 45x37x10 cm horizontal

## Mobile Reporting And Auto Flow

Workshop reporting should automatically move the order to the next step. Office staff should not need to confirm every report.

The system must still record:

- who reported
- when they reported
- quantity reported
- uploaded photos
- abnormal notes
- next state transition

## Quantity Reporting Rules

Exact equality with order quantity is not required.

Example:

- Order quantity: 1000
- Silk-screen may report: 1020
- Bag-making may report: 1005
- Extra quantity is usually sent to the customer

Rules:

- Less than order quantity: mark exception, generally do not auto-create a make-up order.
- Order quantity below 5000: extra quantity up to 50 is normal.
- Order quantity 5000 or above: extra quantity up to 100 is normal.
- Above the allowed extra range: mark exception.
- Track order quantity, silk-screen reported quantity, bag-making reported quantity, and final packed quantity separately.

## Packing Rules

Packing cannot be just a single `已打包` status. It must record package details.

Typical 1000-piece order:

- 1 package x 1000
- or 2 packages: 500 + 500

If actual quantity is 1010:

- record as 500 + 510

Special cases:

- transfer warehouse or sea freight may require per-package weight limits, such as not over 15 kg
- packing workers may need to weigh packages before final packing

Packing mobile side fields:

- package count
- quantity per package
- optional weight per package
- package/customer requirement notes
- completion confirmation

## Fulfillment Completion Rules

### Delivery

`打包完成 -> 出送货单 -> 司机送货 -> 到指定地点拍水印照片上传 -> 已完成`

Delivery orders must have a timestamp/location-watermarked photo at the customer-specified location before completion.

### Customer Pickup

`打包完成 -> 出库单 -> 客户签字确认 -> 已完成`

### Express / Less-Than-Truckload

V1 should not build complex logistics tracking.

Record:

- whether the carrier picked up
- carrier name
- waybill number, license plate, or driver phone if available
- optional handoff photo or note

Self-run online shop API integration may later fetch shipping label records if available.

## Customer Statistics

Saving product styles and print plates is mainly for statistics and scheduling analysis, not old-style fast reorder.

Useful first-version statistics:

- customer monthly order count
- customer monthly quantity
- common size ranking
- printed order ratio
- stock/common-goods order ratio
- common colors
- common fulfillment methods
- average lead-time requirements
- rush-order count
- exception count
- accounts receivable / received / unpaid after finance is connected

## Finance And Reconciliation

Customers may be:

- cash/spot settlement
- periodic settlement: 5 days, 7 days, next month start, etc.

Periodic customers need a statement sent for customer checking before payment.

Statement flow:

- select customer
- select date range
- include completed orders
- generate statement
- export/send to customer
- customer confirms
- record payment

Recommended statement states:

- not generated
- sent
- customer confirmed
- paid
- disputed

Recommended evidence links:

- delivery photos
- pickup signatures
- express pickup records

## Pricing System

### Price Tables

Bag price tables and printing step price tables both support multiple versions.

Customer profile:

- default bag price table: `1`
- default print price table: `1`
- selected customers can be manually changed to table `2`, `3`, etc.

Order entry:

- automatically uses customer-linked bag and print price tables
- saves a price snapshot on the order
- later price table changes do not affect historical orders

### Bag Price

The old thread referenced a picture containing bag size prices. The original temporary image is no longer available, but the extracted rule is:

- bag base unit price is by size
- normal price and `加长提` price are separate columns
- if customer selects `加长提`, use that column instead of normal price
- default bag price does not vary by quantity, color, or customer, except through customer-linked special price tables

### Silk-Screen Printing Step Price

For non-woven bag silk-screen printing:

- below 2000 pieces: 0.12 yuan / piece
- 2000-4900 pieces: 0.09 yuan / piece
- 4910-9050 pieces: 0.08 yuan / piece
- 10000+ pieces: 0.06 yuan / piece

### Printing Price Calculation

Separate step-price calculation by:

- different print content
- different size

Can combine step calculation when:

- same print content
- same size

Do not split merely because:

- print color is different
- bag body color is different

Example:

- order has 3000 pieces, two different patterns of 1500 each
- calculate as two separate 1500-piece print groups

### Replenishment / Add-On Order

Cross-order merging is not normal. It only applies for add-on/replenishment orders:

- same customer
- same content
- same size
- original order has not been printed yet, or the add-on can still join the same print batch

If already printed, do not merge.

When add-on merging is valid, calculate price by the combined total quantity and apply that unit price to the full combined batch.

### Manual Price Override

Some large low-profit or no-profit orders are negotiated temporarily.

Order entry must allow manual unit price edits for the current order only.

Rules:

- default price comes from customer-linked price table
- office user can edit the order's bag unit price or print unit price
- edit does not change the customer price table
- no boss approval needed for now
- the order must clearly show that price differs from the linked price table
- this marker exists so finance can reconcile statements correctly

Suggested stored fields:

- original price-table unit price
- actual transaction unit price
- override flag
- override reason / note

## Product Process Decision

Future discovery should continue one question at a time.

Prioritize real daily exception cases over broad feature lists. The most valuable information is:

- small-order batching reality
- leftover roll handling
- silk-screen versus bag-making bottlenecks
- customer rush orders
- what can and cannot be grouped
- who clicks which system button at which moment

