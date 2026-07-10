import { createPostgresPoolClient } from "./postgresPoolClient.mjs";

export function createPostgresTransactionExecutor(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const transactionJson =
    options.transactionJson ??
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  const idempotentTransactionJson =
    options.idempotentTransactionJson ??
    postgresClient?.idempotentTransactionJson?.bind(postgresClient) ??
    ((request) => transactionJson(request.text, request.values));

  return { transactionJson, idempotentTransactionJson };
}
