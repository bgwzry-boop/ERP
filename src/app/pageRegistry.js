import { createElement, lazy, Suspense } from "react";
import { DriverMobilePage, RawMaterialInboundPage, StatementPage, TodoPage } from "../pages/office/index.jsx";
import { FulfillmentPage } from "../features/fulfillment/FulfillmentPage.jsx";
import { ProductionPackingPage } from "../features/production/ProductionPackingPage.jsx";
import { InventoryPage } from "../features/inventory/InventoryPage.jsx";
import { DataState } from "../shared/ui/operational.jsx";

const PayrollAttendancePage = lazy(() => import("../features/payroll/PayrollAttendancePage.jsx").then((module) => ({ default: module.PayrollAttendancePage })));

export const pageRegistry = Object.freeze({
  todos: (props) => createElement(TodoPage, props.todos),
  statements: (props) => createElement(StatementPage, props.statements),
  driverMobile: (props) => createElement(DriverMobilePage, props.driverMobile),
  rawMaterials: (props) => createElement(RawMaterialInboundPage, props.rawMaterial),
  fulfillment: (props) => createElement(FulfillmentPage, props.fulfillment),
  packing: (props) => createElement(ProductionPackingPage, props.packing),
  inventory: (props) => createElement(InventoryPage, props.inventory),
  payroll: (props) => createElement(
    Suspense,
    { fallback: createElement(DataState, { title: "工资核算工作台加载中" }) },
    createElement(PayrollAttendancePage, props.payroll),
  ),
});

export function renderRegisteredPage(pageKey, pageProps) {
  return pageRegistry[pageKey]?.(pageProps) ?? null;
}
