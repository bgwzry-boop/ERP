import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { checkPostgresIdempotencyAndConcurrency, checkPostgresRepositories } from "./postgres-live/repositoryChecks.mjs";
import { checkApiWithPostgresRepositories } from "./postgres-live/apiChecks.mjs";

const runtime = await startLivePostgres();
try {
  await checkPostgresIdempotencyAndConcurrency(runtime);
  await checkPostgresRepositories(runtime);
  await checkApiWithPostgresRepositories(runtime);
  console.log(
    `PostgreSQL live check passed: migrations, attachment repository, access-audit repository, payment repository, todo action repository/formal two-session conflict, inventory correction transaction repository, inventory intent/temporary-hold transaction repository, production finished-goods photo transaction repository, order draft repository, order confirmation transaction repository, order pool read repository, fulfillment action transaction repository, driver delivery dispatch repository, driver device field-test repository, driver delivery task read repository, inventory ledger read repository, inventory reservation release transaction repository, order line void transaction repository, order line quantity adjustment transaction repository, production packing transaction, production packing read repository, production schedule record repository, print batch repository, print device repository, print job repository, master-data import review repository, master-data import transaction repository, core workspace/master-data restart snapshot, runtime identity repository/formal login/logout revocation, Deli attendance gateway cursor/cache, attendance/payroll import plus concurrent draft/adjustment/state guards, statement payment transaction repository, statement settlement transaction repository, statement send transaction repository, statement export repository, and API routes executed against ${runtime.dockerImage}.`,
  );
} finally {
  await stopLivePostgres(runtime);
}
