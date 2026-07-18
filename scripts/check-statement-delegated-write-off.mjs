await import("./check-business-decision-policy-service.mjs");
await import("./check-statement-financial-command-service.mjs");
await import("./check-statement-settlement-transaction-repository.mjs");

console.log("Statement delegated write-off check passed: authorization policy, authoritative variance, immutable decision evidence, and atomic write-off persistence are covered.");
