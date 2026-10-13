import { isOfficeApiServerRequired } from "./officeAuthService.js";

export function resolveOfficeOrderConfirmationStrategy(result, options = {}) {
  if (
    result?.source === "api"
    && result?.blocked !== true
    && (result?.confirmation?.orderId || result?.confirmation?.closedWithoutOrder === true)
  ) {
    return { kind: "server", confirmation: result.confirmation };
  }
  if (result?.source === "local_fallback" && result?.blocked !== true && !isOfficeApiServerRequired(options)) {
    return { kind: "local_fallback" };
  }
  return {
    kind: "blocked",
    error: result?.error ?? {
      code: "ORDER_DRAFT_CONFIRMATION_UNVERIFIED",
      message: "订单确认未获得可验证的后端事务结果。",
    },
  };
}
