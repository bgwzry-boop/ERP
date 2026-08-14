import { assertCompleteReviewStaticIdentity } from "./completeReviewPreviewIdentity.mjs";

const identity = await assertCompleteReviewStaticIdentity();
console.log(`PASS complete review identity: ${identity.appId} @ ${identity.port}; root workbench @ ${identity.rootWorkbenchPort}`);
