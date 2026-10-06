import { createElement } from "react";
import { RawMaterialInboundPage } from "../pages/office/index.jsx";
import { FulfillmentPage } from "../features/fulfillment/FulfillmentPage.jsx";
import { ProductionPackingPage } from "../features/production/ProductionPackingPage.jsx";

export const pageRegistry = Object.freeze({
  rawMaterials: (props) => createElement(RawMaterialInboundPage, props.rawMaterial),
  fulfillment: (props) => createElement(FulfillmentPage, props.fulfillment),
  packing: (props) => createElement(ProductionPackingPage, props.packing),
});

export function renderRegisteredPage(pageKey, pageProps) {
  return pageRegistry[pageKey]?.(pageProps) ?? null;
}
