import { createElement } from "react";
import { RawMaterialInboundPage } from "../pages/office/index.jsx";

export const pageRegistry = Object.freeze({
  rawMaterials: RawMaterialInboundPage,
});

export function renderPageFromRegistry(pageKey, props) {
  const Page = pageRegistry[pageKey];
  return Page ? createElement(Page, props) : null;
}
