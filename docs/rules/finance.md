# 当前规则：对账、收款与财务

从根 AGENTS.md 按业务域进入。本文件保留已记录决策的原文；跨域修改须同时查阅相关规则。当前完整桌面采用八组业务导航，历史五域及分离价格表方案不再是当前入口。

- The owner uses the third PC for the complete management and finance surface. Owner mobile use should be minimized and is not a V1 dependency; do not mirror the complete owner desktop surface onto a phone by default.

- Customer receipt confirmation follows the actual office process. Office A/B may record and settle a payment when the Alipay/WeChat collection notification and the customer's group message or payment screenshot identify the same receipt; the system must retain durable payment-channel/transaction evidence rather than treating the audible speaker alert alone as evidence. If the customer paid less than the receivable, office records the actual receipt but the remaining balance stays open until the owner's mother explicitly approves or rejects rounding. Approval creates a separate rounding decision tied to the statement and payment; office entry does not grant rounding authority. Exact-payment settlement and approved-rounding settlement remain distinct audit cases.

- Confirming a statement write-off is a high-risk financial write. Before a client invokes the command, it must visibly identify the statement, customer, receivable, received amount, variance, handling result, and that settlement/audit records will change; cancellation must send no write request.

- Statement / payment is a customer-first office desktop workbench: count-bearing account shortcuts and page-scoped customer/statement search drive a dense customer/statement/current/cumulative receivable list; five trusted amounts remain fixed and separate, detail content scrolls independently, and actions follow the active detail tab. Current receivable, current received, current unpaid, historical debt, and cumulative debt must never be conflated; server payment, variance, write-off, attachment, send, confirmation, and export contracts remain authoritative.
