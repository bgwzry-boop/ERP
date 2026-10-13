import { createElement } from "react";
import { PageLoader, TodoPage, InventoryPage, FulfillmentPage, ProductionPackingPage, DriverMobilePage, WarehouseMobilePage, StatementRoute, RawMaterialRoute, PayrollAttendancePage } from "./workspacePageComponents.jsx";

export const pageRegistry = Object.freeze({
  todos: (props) => createElement(PageLoader, { component: TodoPage, fallback: "待办加载中", ...props.todos }),
  inventory: (props) => createElement(PageLoader, { component: InventoryPage, fallback: "成品库存加载中", ...props.inventory }),
  fulfillment: (props) => createElement(PageLoader, { component: FulfillmentPage, fallback: "出库工作台加载中", ...props.fulfillment }),
  packing: (props) => createElement(PageLoader, { component: ProductionPackingPage, fallback: "生产打包加载中", ...props.packing }),
  driverMobile: (props) => createElement(PageLoader, { component: DriverMobilePage, fallback: "司机工作台加载中", ...props.driverMobile }),
  warehouseMobile: (props) => createElement(PageLoader, { component: WarehouseMobilePage, fallback: "库房工作台加载中", ...props.warehouseMobile }),
  statements: (props) => createElement(PageLoader, { component: StatementRoute, fallback: "对账工作台加载中", ...props.statements }),
  rawMaterials: (props) => createElement(PageLoader, { component: RawMaterialRoute, fallback: "原材料工作台加载中", ...props.rawMaterial }),
  payroll: (props) => createElement(PageLoader, { component: PayrollAttendancePage, fallback: "工资核算工作台加载中", ...props.payroll }),
});

export function renderRegisteredPage(pageKey, pageProps) {
  return pageRegistry[pageKey]?.(pageProps) ?? null;
}
