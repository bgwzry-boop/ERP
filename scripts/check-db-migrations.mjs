import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";

const migrations = loadMigrationFiles();
const { createdTables } = validateMigrationSet(migrations);

console.log(`DB migration check passed: ${migrations.length} files, ${createdTables.size} tables`);
