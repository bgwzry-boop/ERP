import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import glob from "../build-tools/safe-glob/index.cjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const roots = [".", "docs/prototypes/raw-material-roll-inventory-review", "docs/prototypes/pc-three-role-navigation-review", "docs/prototypes/erp-semantic-tag-migration-preview", "docs/prototypes/master-data-price-option-1"];
const digest = path => readFile(path).then(data => createHash("sha256").update(data).digest("hex"));
for (const project of roots) {
  const from = createRequire(resolve(root, project, "package.json"));
  const metadata = from("picomatch/package.json");
  assert.equal(metadata.name, "@bagwin/build-glob", `${project}: vulnerable matcher was not replaced`);
  const entry = from.resolve("picomatch");
  for (const file of ["index.cjs", "scan.cjs"]) {
    assert.equal(await digest(resolve(entry, "..", file)), await digest(resolve(root, "build-tools/safe-glob", file)), `${project}: stale local adapter`);
  }
  const engine = createRequire(entry)("minimatch/package.json");
  assert.equal(engine.version, "11.0.9");
  assert.equal(from("vite/package.json").version, "8.3.8");
  assert.throws(() => from.resolve("rollup"), { code: "MODULE_NOT_FOUND" }, "Old Rollup embeds a second vulnerable regex compiler");
}

const fixture = JSON.parse(await readFile(new URL("../build-tools/safe-glob/compatibility.json", import.meta.url)));
let index = 0;
for (const options of fixture.options) for (const pattern of fixture.patterns) for (const input of fixture.paths) {
  assert.equal(glob(pattern, options)(input), fixture.expected[index++] === "1", JSON.stringify({ pattern, input, options }));
}
assert.equal(index, 975);
for (const { pattern, options, expected } of fixture.scans) assert.deepEqual(glob.scan(pattern, options), expected);
assert.equal(glob("!(*.test).js")("x.test.js"), false);
assert.equal(glob("!(*.test).js")("x.js"), true);
assert.equal(glob("**/*.jsx", { windows: true })("src\\App.jsx"), true);
assert.equal(glob("*.jsx", { basename: true })("src/App.jsx"), true);
assert.equal(glob("**/*.jsx", { ignore: "**/draft/**" })("src/draft/App.jsx"), false);
assert.equal(glob("**/*.jsx", { ignore: "**/draft/**" })("src/App.jsx"), true);
assert.throws(() => glob("*", { regex: true }), { code: "ERP_BUILD_GLOB_UNSUPPORTED" });
assert.throws(() => glob.makeRe("+(*a)"), { code: "ERP_BUILD_GLOB_UNSUPPORTED" });
assert.throws(() => glob("a".repeat(4097)), RangeError);
assert.throws(() => glob("*")("a".repeat(32769)), RangeError);
// Numeric ranges are compiled without expansion by the new engine. Use an
// actual exponential brace product for the expansion-budget regression.
assert.throws(() => glob("{a,b}".repeat(20)), RangeError);
assert.equal(glob("{1..1000000}")("500000"), true);
assert.equal(glob("{1..1000000}")("1000001"), false);
let returned;
const withCallbacks = glob("**/*.js", { onResult: result => { returned = result; }, ignore: "**/private/**" }, true);
assert.equal(withCallbacks("src/a.js", true).isMatch, true);
assert.equal(returned.output, "src/a.js");
assert.equal(withCallbacks("src/private/a.js"), false);
assert.equal(withCallbacks.state.isGlob, true);

await new Promise((resolvePromise, reject) => {
  const worker = new Worker(`
    const {parentPort} = require('node:worker_threads');
    const assert = require('node:assert/strict');
    const glob = require(${JSON.stringify(fileURLToPath(new URL("../build-tools/safe-glob/index.cjs", import.meta.url)))});
    const input='a'.repeat(1000)+'!';
    assert.equal(glob('+(*)')(input),true);
    for(const pattern of ['+(*a)','*(?*a)','+(*a|b)','+(a|aa)','+(a|ab)','*'+'a*'.repeat(40)+'b']) assert.equal(glob(pattern)(input),false,pattern);
    for(let i=0;i<50;i++) assert.equal(glob('+(*a)')(input),false);
    parentPort.postMessage('bounded');
  `, { eval: true });
  const timer = setTimeout(() => { void worker.terminate(); reject(Error("Non-backtracking adversarial check exceeded 3 seconds")); }, 3000);
  worker.once("message", message => { clearTimeout(timer); assert.equal(message, "bounded"); resolvePromise(); });
  worker.once("error", error => { clearTimeout(timer); reject(error); });
  worker.once("exit", code => { if (code !== 0) { clearTimeout(timer); reject(Error(`Glob worker exited ${code}`)); } });
});

const directory = await realpath(await mkdtemp(join(tmpdir(), "erp-safe-glob-")));
let server;
try {
  await mkdir(join(directory, "src"));
  for (const name of ["App.jsx", "main.js", "App.test.jsx", "[draft].jsx", "(draft).jsx"]) await writeFile(join(directory, "src", name), "export default 1;");
  await writeFile(join(directory, ".env"), "ERP_ISOLATED_TEST_SECRET=synthetic");
  await writeFile(join(directory, ".npmrc"), "ERP_ISOLATED_TEST_SECRET=synthetic");
  await writeFile(join(directory, "secret.pem"), "ERP_ISOLATED_TEST_SECRET=synthetic");
  await mkdir(join(directory, ".git"));
  await writeFile(join(directory, ".git/config"), "ERP_ISOLATED_TEST_SECRET=synthetic");
  await writeFile(join(directory, "safe.js"), "export const value = 1;");
  const { glob: files } = require("tinyglobby");
  assert.deepEqual((await files("src/**/*.{js,jsx}", { cwd: directory, ignore: ["**/*.test.*"] })).sort(), ["src/(draft).jsx", "src/App.jsx", "src/[draft].jsx", "src/main.js"]);
  const { fdir } = require("fdir");
  assert.deepEqual(new fdir().withRelativePaths().glob("**/*.jsx").crawl(join(directory, "src")).sync().sort(), ["(draft).jsx", "App.jsx", "App.test.jsx", "[draft].jsx"]);
  const { createServer } = await import("vite");
  server = await createServer({ configFile: false, root: directory, logLevel: "silent", server: { host: "127.0.0.1", port: 0, fs: { strict: true, allow: [directory] } } });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const path of ["/.env", "/.env?raw", `/@fs/${directory}/.env?raw`, "/.npmrc?raw", "/secret.pem?raw", "/.git/config?raw"]) {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 403, `Deny filters must block ${path}`);
    assert.doesNotMatch(await response.text(), /ERP_ISOLATED_TEST_SECRET/);
  }
  const allowed = await fetch(`${origin}/safe.js`, { signal: AbortSignal.timeout(5000) });
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /value = 1/);
} finally { await server?.close(); await rm(directory, { recursive: true, force: true }); }
console.log("PASS safe build toolchain: 975 preserved path cases, scanner compatibility, bounded hostile extglobs, strict unsupported APIs, exact engine resolution, real Tinyglobby/Fdir results and live Vite secret-file denial. Business assertions unchanged.");
