import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, realpathSync, existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const PROTECTED_THREAD = '01a033fd-46b4-77f0-ac35-beaa103f08a4';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', timeout: 30_000, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const sameFile = (a, b) => a.ino === b.ino && a.dev === b.dev && a.size === b.size && a.mtimeMs === b.mtimeMs;
const normalizedPath = path => { try { return realpathSync(path); } catch { return path; } };

// This intentionally never walks attachments, credentials, backups, other worktrees or sessions.
function legacyBundles(root) {
  const base = join(root, '.erp-local-storage', 'deployment', 'erp-staging-01');
  if (!existsSync(base)) return [];
  if (realpathSync(base) !== base) throw new Error('Legacy deployment directory must not traverse a symlink');
  const files = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^(preview\d+(?:-[a-f0-9]+)?|staging-20260820-desktop-runtime-r1-16ed085f)$/.test(entry.name)) continue;
    const dir = join(base, entry.name);
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && item.name.endsWith('.bundle')) files.push(join(dir, item.name));
    }
  }
  return files.sort();
}

export function inspectBundle(root, file, now = Date.now()) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) return { eligible: false, reason: 'not-regular-file' };
  if (now - stat.mtimeMs < 30 * DAY) return { eligible: false, reason: 'retain-at-least-30-days' };
  try {
    const canonical = git(root, ['rev-parse', 'refs/remotes/origin/codex/staging-current']);
    const refs = git(root, ['bundle', 'list-heads', file]).split('\n').map(line => line.split(' ')[0]);
    if (!refs.length || refs.some(sha => !/^[a-f0-9]{40}$/.test(sha))) throw new Error('invalid-refs');
    for (const sha of refs) git(root, ['merge-base', '--is-ancestor', sha, canonical]);
    git(root, ['bundle', 'verify', file]);
    return { eligible: true, bytes: stat.size, refs, canonical, stat };
  } catch {
    return { eligible: false, reason: 'unverified-or-not-in-canonical' };
  }
}

export function auditBundles(projectRoot, { apply = false, now = Date.now() } = {}) {
  const root = realpathSync(projectRoot);
  let removedBytes = 0;
  const bundles = legacyBundles(root).map(file => {
    const result = inspectBundle(root, file, now);
    const { stat, ...safe } = result;
    const record = { file: file.slice(root.length + 1), ...safe, removed: false };
    if (apply && result.eligible) {
      // Revalidate immediately before deletion; fail rather than delete changed evidence.
      const fresh = inspectBundle(root, file, now);
      if (!fresh.eligible || fresh.canonical !== result.canonical || !sameFile(stat, fresh.stat)) {
        throw new Error(`Bundle changed during inspection: ${record.file}`);
      }
      unlinkSync(file);
      record.removed = true;
      removedBytes += result.bytes;
    }
    return record;
  });
  return { bundles, removedBytes };
}

export function auditSessions(projectRoot, codexRoot = join(homedir(), '.codex')) {
  const database = join(codexRoot, 'state_5.sqlite');
  if (!existsSync(database)) return { available: false, reason: 'metadata-db-absent' };
  try {
    const rows = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', database,
      'SELECT id, coalesce(name,title) AS name, cwd, rollout_path FROM threads;'],
    { encoding: 'utf8', timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }) || '[]');
    const root = realpathSync(projectRoot);
    const worktrees = git(root, ['worktree', 'list', '--porcelain']).split('\n')
      .filter(line => line.startsWith('worktree ')).map(line => line.slice(9));
    const allowed = new Set([root, ...worktrees.map(normalizedPath)]);
    const sessions = rows.filter(row => allowed.has(normalizedPath(row.cwd))).map(row => {
      const variants = [row.rollout_path, `${row.rollout_path}.zst`];
      let bytes = 0;
      let files = 0;
      for (const path of variants) {
        if (!path || !existsSync(path)) continue;
        const stat = lstatSync(path);
        if (stat.isFile() && !stat.isSymbolicLink()) { bytes += stat.size; files += 1; }
      }
      return { id: row.id, name: row.name.slice(0, 80), bytes, files, protected: row.id === PROTECTED_THREAD };
    }).sort((a, b) => b.bytes - a.bytes);
    return { available: true, count: sessions.length, bytes: sessions.reduce((sum, s) => sum + s.bytes, 0),
      missingFiles: sessions.filter(s => !s.files).length, largeCount: sessions.filter(s => s.bytes >= 100 * 1024 * 1024).length,
      top: sessions.slice(0, 20), protectedThread: sessions.find(s => s.protected) ?? null,
      note: 'Metadata and file sizes only; compressed storage size is not context length or proof of corruption. No session is edited or deleted.' };
  } catch {
    return { available: false, reason: 'metadata-check-failed' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply-obsolete-bundles');
  let root = process.cwd();
  let report = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing project root');
      root = resolve(args[++i]);
    } else if (args[i] === '--report') report = true;
    else if (args[i] !== '--apply-obsolete-bundles') throw new Error(`Unknown option: ${args[i]}`);
  }
  root = realpathSync(root);
  if (!existsSync(join(root, 'deploy', 'release-policy.json'))) throw new Error('Not an ERP checkout');
  const result = { schemaVersion: 'erp-local-storage-hygiene-v1', checkedAt: new Date().toISOString(), apply,
    sessions: auditSessions(root), ...auditBundles(root, { apply }) };
  if (report) {
    const dir = join(root, '.erp-local-storage', 'hygiene');
    mkdirSync(dir, { recursive: true });
    if (realpathSync(dir) !== dir) throw new Error('Report directory must not traverse a symlink');
    writeFileSync(join(dir, `audit-${Date.now()}.json`), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ sessions: result.sessions, bundles: result.bundles.length,
    eligibleBundles: result.bundles.filter(b => b.eligible).length,
    eligibleBytes: result.bundles.filter(b => b.eligible).reduce((sum, b) => sum + b.bytes, 0),
    removedBytes: result.removedBytes }, null, 2));
}
