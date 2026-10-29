#!/usr/bin/env node
// 把 design.md 里的硬性视觉规则变成自动检查（不依赖第三方包）。
//
// 规则：
//   raw-color        页面样式不得直接写 #hex / rgb() / rgba() / hsl() 颜色，只能引用 tokens.css 里的 token
//   desktop-under-11 任何样式 font-size 不得低于 11px
//   mobile-under-14  现场手机端样式 font-size 不得低于 14px
//
// 存量问题记录在 scripts/design-token-baseline.json（按 文件 × 规则 计数）。
// 检查采用“只降不升”：某个文件某条规则的数量超过基线就失败；低于基线会提示你收紧基线。
//
// 用法：
//   node scripts/check-design-tokens.mjs                    检查
//   node scripts/check-design-tokens.mjs --list             列出全部违规位置
//   node scripts/check-design-tokens.mjs --update-baseline  修完一批后收紧基线（不允许借此放宽，见下）
//   node scripts/check-design-tokens.mjs --update-baseline --allow-increase  确需放宽时显式声明

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const stylesRoot = join(repoRoot, "src", "styles");
const baselinePath = join(repoRoot, "scripts", "design-token-baseline.json");

// 只有 token 定义文件允许写原始颜色。
const RAW_COLOR_EXEMPT = new Set(["src/styles/tokens.css"]);
// 现场手机端样式：文件名含 mobile，或明确属于手机角色页面的文件。
const MOBILE_FILES = new Set(["src/styles/features/driver.css"]);
const isMobileFile = (file) => /mobile/i.test(basename(file)) || MOBILE_FILES.has(file);
// 打印样式按纸面尺寸排版，不适用屏幕字号下限。
const isPrintFile = (file) => /print/i.test(basename(file));

const args = new Set(process.argv.slice(2));

function listCssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listCssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

// 去掉注释但保留换行，保证行号准确。
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const FONT_SIZE_RE = /font-size\s*:\s*([0-9.]+)px/g;

// 只看属性值部分，避免把 #id 选择器当成颜色。
function declarationValues(line) {
  const values = [];
  const re = /[a-z-]+\s*:\s*([^;{}]+)/gi;
  let m;
  while ((m = re.exec(line))) values.push(m[1]);
  return values;
}

function scanFile(absPath) {
  const file = relative(repoRoot, absPath).split("\\").join("/");
  const lines = stripComments(readFileSync(absPath, "utf8")).split("\n");
  const findings = [];
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!RAW_COLOR_EXEMPT.has(file)) {
      for (const value of declarationValues(line)) {
        for (const m of value.matchAll(RAW_COLOR_RE)) {
          findings.push({ file, line: lineNo, rule: "raw-color", text: m[0] });
        }
      }
    }
    if (!isPrintFile(file)) {
      for (const m of line.matchAll(FONT_SIZE_RE)) {
        const px = Number(m[1]);
        if (px < 11) findings.push({ file, line: lineNo, rule: "desktop-under-11", text: `${px}px` });
        else if (px < 14 && isMobileFile(file)) findings.push({ file, line: lineNo, rule: "mobile-under-14", text: `${px}px` });
      }
    }
  });
  return findings;
}

function countByFileRule(findings) {
  const counts = {};
  for (const f of findings) {
    counts[f.file] ??= {};
    counts[f.file][f.rule] = (counts[f.file][f.rule] ?? 0) + 1;
  }
  return counts;
}

function sortObject(obj) {
  return Object.fromEntries(
    Object.keys(obj).sort().map((k) => [k, typeof obj[k] === "object" ? sortObject(obj[k]) : obj[k]]),
  );
}

const findings = listCssFiles(stylesRoot).flatMap(scanFile);
const current = countByFileRule(findings);
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};

if (args.has("--list")) {
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.text}`);
}

const regressions = [];
const improvements = [];
for (const file of new Set([...Object.keys(current), ...Object.keys(baseline)])) {
  for (const rule of new Set([...Object.keys(current[file] ?? {}), ...Object.keys(baseline[file] ?? {})])) {
    const now = current[file]?.[rule] ?? 0;
    const allowed = baseline[file]?.[rule] ?? 0;
    if (now > allowed) regressions.push({ file, rule, now, allowed });
    else if (now < allowed) improvements.push({ file, rule, now, allowed });
  }
}

if (args.has("--update-baseline")) {
  // 首次生成基线时没有可比对象，直接写入。
  if (existsSync(baselinePath) && regressions.length && !args.has("--allow-increase")) {
    console.error("拒绝更新基线：以下文件的违规数量比基线多。请先修复，或确需放宽时加 --allow-increase。");
    for (const r of regressions) console.error(`  ${r.file}  ${r.rule}  ${r.allowed} → ${r.now}`);
    process.exit(1);
  }
  writeFileSync(baselinePath, `${JSON.stringify(sortObject(current), null, 2)}\n`);
  console.log(`已写入基线：${findings.length} 处存量问题。`);
  process.exit(0);
}

const totals = findings.reduce((acc, f) => ({ ...acc, [f.rule]: (acc[f.rule] ?? 0) + 1 }), {});
console.log(`design tokens: raw-color ${totals["raw-color"] ?? 0} · <11px ${totals["desktop-under-11"] ?? 0} · 手机<14px ${totals["mobile-under-14"] ?? 0}`);

if (improvements.length) {
  console.log(`有 ${improvements.length} 项比基线更好，运行 --update-baseline 把基线收紧。`);
}

if (regressions.length) {
  console.error("\n新增了违反 design.md 的样式：");
  for (const r of regressions) {
    console.error(`  ${r.file}  ${r.rule}  基线 ${r.allowed} → 现在 ${r.now}`);
    for (const f of findings.filter((x) => x.file === r.file && x.rule === r.rule)) {
      console.error(`    :${f.line}  ${f.text}`);
    }
  }
  console.error("\n颜色请改用 src/styles/tokens.css 里的 --erp-* token；字号请遵守 design.md「Typography」。");
  process.exit(1);
}

console.log("design tokens: 没有新增违规 ✓");
