import { validateOpenApi } from "../server/openapiValidation.mjs";

const result = validateOpenApi();

console.log(
  `OpenAPI ${result.openapi}: ${result.pathCount} paths, ${result.schemaCount} schemas, ${result.tagCount} tags, ${result.refCount} refs`,
);

if (!result.valid) {
  console.error(`Missing refs: ${result.missingRefs.join(", ")}`);
  process.exit(1);
}
