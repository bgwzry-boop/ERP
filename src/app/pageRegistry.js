import { createElement } from "react";
import { RawMaterialInboundPage } from "../pages/office/index.jsx";
import { FulfillmentPage } from "../features/fulfillment/FulfillmentPage.jsx";

export const pageRegistry = Object.freeze({
  rawMaterials: (props) => createElement(RawMaterialInboundPage, props.rawMaterial),
  fulfillment: (props) => createElement(FulfillmentPage, props.fulfillment),
});

export function renderRegisteredPage(pageKey, pageProps) {
  return pageRegistry[pageKey]?.(pageProps) ?? null;
}
