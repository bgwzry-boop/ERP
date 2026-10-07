import { statusAssertions } from "./assertions/status.mjs";
import { productionEnvAssertions } from "./assertions/productionEnv.mjs";
import { readinessAssertions } from "./assertions/readiness.mjs";
import { refreshAssertions } from "./assertions/refresh.mjs";

export { assertInitialGoLiveStatus } from "./assertions/status.mjs";
export { assertClientGoLiveStatus } from "./assertions/response.mjs";

export const goLiveAssertions = Object.freeze({
  ...statusAssertions,
  ...productionEnvAssertions,
  ...readinessAssertions,
  ...refreshAssertions,
});
