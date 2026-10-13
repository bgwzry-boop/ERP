import { lazy, Suspense } from "react";
import { DataState } from "../shared/ui/operational.jsx";

function lazyNamedPage(loadModule, exportName, loadStyles = []) {
  return lazy(async () => {
    const [module] = await Promise.all([loadModule(), ...loadStyles.map((loadStyle) => loadStyle())]);
    return { default: module[exportName] };
  });
}

export function PageLoader({ component: Component, fallback, ...props }) {
  return (
    <Suspense fallback={<DataState title={fallback} />}>
      <Component {...props} />
    </Suspense>
  );
}

export const TodoPage = lazyNamedPage(() => import("../features/todos/TodoPage.jsx"), "TodoPage", [() => import("../styles/features/todos.css")]);

export const EntryPage = lazyNamedPage(() => import("../features/orders/EntryPage.jsx"), "EntryPage", [() => import("../styles/features/orders-entry.css")]);

export const OrderPoolPage = lazyNamedPage(() => import("../features/orders/OrderPoolPage.jsx"), "OrderPoolPage", [() => import("../styles/features/orders-pool.css")]);

export const InventoryPage = lazyNamedPage(() => import("../features/inventory/InventoryPage.jsx"), "InventoryPage", [() => import("../styles/features/inventory.css")]);

export const FulfillmentPage = lazyNamedPage(() => import("../features/fulfillment/FulfillmentPage.jsx"), "FulfillmentPage", [() => import("../styles/features/fulfillment.css")]);

export const ProductionPackingPage = lazyNamedPage(() => import("../features/production/ProductionPackingPage.jsx"), "ProductionPackingPage", [() => import("../styles/features/production-print.css"), () => import("../styles/features/print-documents.css")]);

export const WorkshopMobilePage = lazyNamedPage(() => import("../features/workshop/WorkshopMobilePage.jsx"), "WorkshopMobilePage", [() => import("../styles/features/mobile-roles.css"), () => import("../styles/features/production-print.css")]);

export const DriverMobilePage = lazyNamedPage(() => import("../features/driver/DriverMobilePage.jsx"), "DriverMobilePage", [() => import("../styles/features/mobile-roles.css"), () => import("../styles/features/driver.css")]);

export const WarehouseMobilePage = lazyNamedPage(() => import("../features/warehouse/WarehouseMobilePage.jsx"), "WarehouseMobilePage", [() => import("../styles/features/mobile-roles.css"), () => import("../styles/features/warehouse.css")]);

export const StatementRoute = lazyNamedPage(() => import("./routes/StatementRoute.jsx"), "StatementRoute");

export const RawMaterialRoute = lazyNamedPage(() => import("./routes/RawMaterialRoute.jsx"), "RawMaterialRoute");

export const MasterDataRoute = lazyNamedPage(() => import("./routes/MasterDataRoute.jsx"), "MasterDataRoute");

export const V1StatusRoute = lazyNamedPage(() => import("./routes/V1StatusRoute.jsx"), "V1StatusRoute");

export const OfficeMobilePage = lazyNamedPage(() => import("../features/office-mobile/OfficeMobilePage.jsx"), "OfficeMobilePage", [() => import("../styles/features/mobile-roles.css")]);

export const DecisionMobilePage = lazyNamedPage(() => import("../features/decisions/DecisionMobilePage.jsx"), "DecisionMobilePage", [() => import("../styles/features/mobile-roles.css"), () => import("../styles/features/role-tools.css")]);

export const MaintenanceMobilePage = lazyNamedPage(() => import("../features/maintenance/MaintenanceMobilePage.jsx"), "MaintenanceMobilePage", [() => import("../styles/features/mobile-roles.css"), () => import("../styles/features/role-tools.css")]);

export const DesktopRequiredMobilePage = lazyNamedPage(() => import("../features/mobile/DesktopRequiredMobilePage.jsx"), "DesktopRequiredMobilePage", [() => import("../styles/features/mobile-roles.css")]);

export const PayrollAttendancePage = lazyNamedPage(() => import("../features/payroll/PayrollAttendancePage.jsx"), "PayrollAttendancePage", [() => import("../styles/features/payroll-attendance.css")]);

export const EmployeeAttendanceMobilePage = lazyNamedPage(() => import("../features/payroll/EmployeeAttendanceMobilePage.jsx"), "EmployeeAttendanceMobilePage", [() => import("../styles/features/payroll-attendance.css")]);
