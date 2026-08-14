import { readFile } from "node:fs/promises";

import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { createPostgresErpPriceReleaseRepository } from "../server/miniapp/erpPriceReleaseRepository.mjs";
import { createErpPriceReleaseService } from "../server/miniapp/erpPriceReleaseService.mjs";

function argumentsMap(argv) {
  const result = { command: argv[0] ?? "" };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) throw new Error("Invalid command arguments.");
    result[key.slice(2)] = argv[index + 1];
  }
  return result;
}

const args = argumentsMap(process.argv.slice(2));
const databaseUrl = String(process.env.ERP_PRICE_RELEASE_DATABASE_URL ?? process.env.ERP_V1_DATABASE_URL ?? "").trim();
if (!databaseUrl) throw new Error("ERP_PRICE_RELEASE_DATABASE_URL or ERP_V1_DATABASE_URL is required.");
const service = createErpPriceReleaseService({
  repository: createPostgresErpPriceReleaseRepository({ databaseUrl }),
});

try {
  let result;
  if (args.command === "draft") {
    if (!args.bundle || !args.actor) throw new Error("draft requires --bundle and --actor.");
    const bundle = JSON.parse(await readFile(args.bundle, "utf8"));
    result = await service.createDraft({ bundle, createdBy: args.actor });
  } else if (args.command === "review") {
    if (!args.release || !args.actor) throw new Error("review requires --release and --actor.");
    result = await service.review({ releaseId: args.release, reviewedBy: args.actor });
  } else if (args.command === "publish") {
    if (!args.release || !args.actor) throw new Error("publish requires --release and --actor.");
    result = await service.publish({ releaseId: args.release, publishedBy: args.actor });
  } else {
    throw new Error("Command must be draft, review, or publish.");
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeSharedPostgresPools();
}
