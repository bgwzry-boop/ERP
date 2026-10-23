import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const read = path => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)));
const ledger = JSON.parse(read("docs/development/p1-legacy-integration-ledger-20261023.json"));
const index = ledger.semanticReview;
assert.equal(index?.sourceCount, 497, "The accepted frozen remaining set must remain explicit");
assert.equal(ledger.entries.length, 611);
assert.equal(new Set(ledger.entries.map(row => row.commit)).size, 611);
assert.equal(index.sourceCommits.length, 497);
const expected = new Set(index.sourceCommits);
assert.equal(expected.size, 497);
const reviewed = new Map();
for (const source of index.reports) {
  const bytes = read(source.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256, `Review report changed without index reconciliation: ${source.path}`);
  const report = JSON.parse(bytes);
  const records = report.records ?? report.entries;
  assert.equal(records.length, source.count, source.path);
  for (const row of records) {
    assert.match(row.commit, /^[a-f0-9]{40}$/);
    assert.ok(expected.has(row.commit), `Unexpected source ${row.commit}`);
    assert.ok(!reviewed.has(row.commit), `Duplicate source ${row.commit}`);
    assert.ok(row.reason?.trim() && row.decision?.trim());
    assert.ok(row.currentEvidence?.length && row.validation, `Missing scoped evidence: ${row.commit}`);
    assert.notEqual(row.wholeCommitIntegrated, true, "These reports do not assert whole legacy patches were integrated");
    const patch = row.legacyPatchSha256 ?? row.legacyDiffSha256 ?? row.diffReviewProvenance?.patchSha256;
    assert.match(patch, /^[a-f0-9]{64}$/);
    reviewed.set(row.commit, { row, source });
  }
}
assert.equal(reviewed.size, 497);
for (const commit of expected) {
  const entry = ledger.entries.find(row => row.commit === commit);
  const { row, source } = reviewed.get(commit);
  assert.equal(entry.previousClassification?.status, "deferred-semantic-review");
  assert.ok(entry.status.startsWith("reviewed-"));
  assert.equal(entry.businessReview.report, source.path);
  assert.equal(entry.businessReview.decision, row.decision);
  assert.equal(entry.businessReview.wholeCommitIntegrated, false);
}
const counts = {};
for (const row of ledger.entries) counts[row.status] = (counts[row.status] ?? 0) + 1;
assert.deepEqual(ledger.summary.statusCounts, counts);
assert.equal(counts["deferred-semantic-review"] ?? 0, 0);
assert.ok((counts["reviewed-followup-required"] ?? 0) > 0, "Known remaining product work must not be relabelled complete");
assert.equal(ledger.auditSnapshot.comparedCommit, "92060c76526bab415f1c9ebb172adea5fd45ae01", "Historical mechanical evidence must not be rewritten as a current verdict");
assert.equal(ledger.preservation.entries.length, 59);
assert.equal(ledger.summary.legacyUncommittedTracked, 21);
assert.equal(ledger.summary.legacyUntracked, 38);
console.log("Legacy review index passed: exact 497-source coverage, four report digests, no duplicate/unknown entries, preserved 611 historical records and explicit unfinished scopes.");
