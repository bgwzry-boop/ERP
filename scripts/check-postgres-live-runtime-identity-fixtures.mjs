import assert from "node:assert/strict";
import { verifyRuntimeUserPassword } from "../server/authSeed.mjs";
import { buildLiveRuntimeUser } from "./helpers/postgresLiveRuntimeIdentityFixtures.mjs";

const authSecret = "postgres-live-runtime-identity-fixture-secret";
const password = "runtime-fixture-password-001";
const user = buildLiveRuntimeUser({
  userId: "U-RUNTIME-IDENTITY-FIXTURE-001",
  loginName: "runtime.fixture.identity",
  password,
  authSecret,
  displayName: "PostgreSQL 运行身份夹具",
  role: "technical_operations",
  department: "system",
  employeeId: "EMP-RUNTIME-IDENTITY-FIXTURE-001",
});

assert.equal(user.defaultRole, "technical_operations");
assert.deepEqual(user.roles, [user.defaultRole]);
assert.equal(user.enabled, true);
assert.equal(user.loginEnabled, true);
assert.equal(user.source, "master_data_import_review");
assert.equal(user.passwordStatus, "active");
assert.equal(user.mustChangePassword, false);
assert.equal(user.passwordHash.includes(password), false);
assert.match(user.passwordHash, /^runtime-password-v2\./);
assert.equal(verifyRuntimeUserPassword(user, password, { authSecret }), true);
assert.equal(verifyRuntimeUserPassword(user, "wrong-runtime-fixture-password", { authSecret }), false);
assert.throws(
  () => buildLiveRuntimeUser({ userId: "U-RUNTIME-IDENTITY-FIXTURE-002" }),
  /runtime-auth secret is required/,
);

console.log("PostgreSQL live runtime-identity fixture checks passed: explicit secret, persisted identity shape, and password verification are stable.");
