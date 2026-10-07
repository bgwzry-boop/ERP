import { createElement } from "react";
import { RawMaterialInboundPage } from "../pages/office/index.jsx";
import { FulfillmentPage } from "../features/fulfillment/FulfillmentPage.jsx";
import { ProductionPackingPage } from "../features/production/ProductionPackingPage.jsx";
import { InventoryPage } from "../features/inventory/InventoryPage.jsx";

export const pageRegistry = Object.freeze({
  rawMaterials: (props) => createElement(RawMaterialInboundPage, props.rawMaterial),
  fulfillment: (props) => createElement(FulfillmentPage, props.fulfillment),
  packing: (props) => createElement(ProductionPackingPage, props.packing),
  inventory: (props) => createElement(InventoryPage, props.inventory),
});

export function renderRegisteredPage(pageKey, pageProps) {
  return pageRegistry[pageKey]?.(pageProps) ?? null;
}
