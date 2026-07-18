import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleStatementWriteRoutes } from "../server/routes/statementWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { idempotencyKey: "statement-write-route-check" },
  permissionContext: { actionPermissions: [] },
  authContext: { user: { userId: "U-AUTH" } },
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
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  statementCommunicationCommandService: {},
  statementFinancialCommandService: {},
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "response", response, result, options });
  },
};

for (const [serviceName, commandName, kind] of [
  ["statementCommunicationCommandService", "previewStatement", "preview"],
  ["statementCommunicationCommandService", "markStatementSent", "sent"],
  ["statementCommunicationCommandService", "markStatementSendReceipt", "receipt"],
  ["statementCommunicationCommandService", "recordStatementCustomerConfirmation", "confirmation"],
  ["statementFinancialCommandService", "recordPayment", "payment"],
  ["statementFinancialCommandService", "handleVariance", "variance"],
  ["statementFinancialCommandService", "writeOffStatement", "writeOff"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { response: { command: kind } };
  };
}

for (const [action, permission, kind] of [
  ["preview", "statement.preview", "preview"],
  ["mark-sent", "statement.send", "sent"],
  ["send-receipt", "statement.send", "receipt"],
  ["customer-confirmation", "statement.send", "confirmation"],
  ["payments", "statement.payment.record", "payment"],
  ["variance", "statement.variance.handle", "variance"],
  ["write-off", "statement.write_off", "writeOff"],
]) {
  await expectHandled(action, permission, kind);
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
assert.equal(await run("GET", "/api/statements/ST-1/preview"), false);
assert.equal(await run("POST", "/api/statements/ST-1/exports"), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/statementWriteRoutes.mjs", import.meta.url), "utf8");
for (const removedWrapper of [
  "previewStatementRoute",
  "markStatementSentRoute",
  "markStatementSendReceiptRoute",
  "recordStatementCustomerConfirmationRoute",
  "recordStatementPaymentRoute",
  "handleStatementVarianceRoute",
  "writeOffStatementRoute",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`async function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handleStatementWriteRoutes\([\s\S]*statementCommunicationCommandService,[\s\S]*statementFinancialCommandService,[\s\S]*sendCommandResponse,/);
assert.doesNotMatch(routeSource, /TransactionRepository|confirmStatement|buildStatement|validateBusinessAttachment|statement\.receivable|statement\.received/);

console.log("statement write routes checks passed: seven permissions, authenticated operators, communication/financial commands, standard responses, and thin API wiring are covered");

async function expectHandled(action, permission, kind) {
  calls.length = 0;
  assert.equal(await run("POST", `/api/statements/ST-1/${action}`), true);
  assert.deepEqual(calls, [
    {
      kind: "permission",
      response: dependencies.response,
      permissionContext: dependencies.permissionContext,
      permission,
    },
    {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback: "U-OFFICE-A",
    },
    {
      kind,
      workspace: dependencies.workspace,
      statementId: "ST-1",
      body: dependencies.body,
      operatorId: "U-RESOLVED",
      ...(["variance", "writeOff"].includes(kind)
        ? { actionPermissions: dependencies.permissionContext.actionPermissions }
        : {}),
    },
    {
      kind: "response",
      response: dependencies.response,
      result: { response: { command: kind } },
      options: undefined,
    },
  ]);
}

function run(method, pathname) {
  return handleStatementWriteRoutes({ ...dependencies, method, url: new URL(`http://erp.test${pathname}`) });
}
