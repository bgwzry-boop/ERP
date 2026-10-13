import { App } from "../../../../src/App.jsx";
import "../../../../src/styles/base.css";
import "../../../../src/styles/shared.css";
import "../../../../src/styles/shell.css";
import "../../../../src/styles/components.css";
import "../../../../src/styles/features/todos.css";
import "../../../../src/styles/features/orders-entry.css";
import "../../../../src/styles/features/orders-pool.css";
import "../../../../src/styles/features/inventory.css";
import "../../../../src/styles/features/fulfillment.css";
import "../../../../src/styles/features/statements.css";
import "../../../../src/styles/features/role-tools.css";
import "../../../../src/styles/features/driver.css";
import "../../../../src/styles/features/warehouse.css";
import "../../../../src/styles/features/mobile-roles.css";
import "../../../../src/styles/features/raw-material.css";
import "../../../../src/styles/features/master-data.css";
import "../../../../src/styles/features/payroll-attendance.css";
import "../../../../src/styles/features/production-print.css";
import "../../../../src/styles/features/print-documents.css";
import "../../../../src/styles/features/attachments.css";
import "../../../../src/styles/features/v1-status-base.css";
import "../../../../src/styles/features/v1-status.css";
import "../../../../src/styles/interface-polish.css";

export function FormalMobileEntry() {
  return <App signedPreviewUserId="U-MANAGER-A" />;
}
