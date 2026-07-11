import assert from "node:assert/strict";
import { handleStatementWriteRoutes } from "../server/routes/statementWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-OFFICE-A" },
  permissionContext: { actionPermissions: [] },
  authContext: { userId: "U-AUTHENTICATED" },
  getPermissionOperatorId(permissionContext, authContext) {
    assert.equal(permissionContext, dependencies.permissionContext);
    return authContext.userId;
  },
  writeActionPermissions: {
    previewStatement: "statement.preview",
    markStatementSent: "statement.send",
    recordStatementPayment: "statement.payment.record",
    handleStatementVariance: "statement.variance.handle",
    writeOffStatement: "statement.write_off",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
};
for (const [name, permission, kind] of [
  ["preview", "statement.preview", "preview"],
  ["mark-sent", "statement.send", "sent"],
  ["send-receipt", "statement.send", "receipt"],
  ["customer-confirmation", "statement.send", "confirmation"],
  ["payments", "statement.payment.record", "payment"],
  ["variance", "statement.variance.handle", "variance"],
  ["write-off", "statement.write_off", "writeOff"],
]) {
  dependencies[`${kind}StatementRoute`] = async (input) => calls.push({ kind, ...input });
  const routeKeyByKind = {
    preview: "previewStatementRoute",
    sent: "markStatementSentRoute",
    receipt: "markStatementSendReceiptRoute",
    confirmation: "recordStatementCustomerConfirmationRoute",
    payment: "recordStatementPaymentRoute",
    variance: "handleStatementVarianceRoute",
    writeOff: "writeOffStatementRoute",
  };
  dependencies[routeKeyByKind[kind]] = dependencies[`${kind}StatementRoute`];
  await expectHandled(name, permission, kind);
}

calls.length = 0;
assert.equal(
  await handleStatementWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/statements/ST-1/payments"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(
  await handleStatementWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/statements/ST-1/preview") }),
  false,
);
assert.equal(
  await handleStatementWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/statements/ST-1/exports") }),
  false,
);

console.log("statement write routes checks passed");

async function expectHandled(action, permission, kind) {
  calls.length = 0;
  assert.equal(await handleStatementWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test/api/statements/ST-1/${action}`) }), true);
  assert.deepEqual(calls, [
    {
      kind: "permission",
      response: dependencies.response,
      permissionContext: dependencies.permissionContext,
      permission,
    },
    {
      kind,
      response: dependencies.response,
      workspace: dependencies.workspace,
      statementId: "ST-1",
      body: dependencies.body,
      operatorId: "U-AUTHENTICATED",
    },
  ]);
}
