'use strict';

// Use the non-backtracking matcher, never a glob-derived RegExp. The only
// retained Picomatch source is its lexical path scanner (see NOTICE.md).
const { Minimatch } = require('minimatch');
const scan = require('./scan.cjs');
const MAX_PATTERN = 4096;
const MAX_PATTERNS = 1024;
const MAX_INPUT = 32768;

function unsupported(feature) {
  const error = new TypeError(`ERP build glob does not support ${feature}; refusing a regex fallback`);
  error.code = 'ERP_BUILD_GLOB_UNSUPPORTED';
  throw error;
}

function validatePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) throw new TypeError('Expected a non-empty glob pattern');
  if (pattern.length > MAX_PATTERN) throw new RangeError('ERP build glob pattern is too long');
  return pattern.startsWith('./') ? pattern.slice(2) : pattern;
}

function optionsFor(options) {
  for (const key of ['regex', 'capture', 'contains', 'bash']) if (options[key] === true) unsupported(key);
  if (options.prepend || options.expandRange) unsupported('custom regex expansion');
  return {
    dot: Boolean(options.dot), nocase: Boolean(options.nocase),
    noglobstar: Boolean(options.noglobstar), nobrace: Boolean(options.nobrace),
    noext: options.noextglob === true || options.noext === true,
    nonegate: Boolean(options.nonegate), nocomment: true,
    matchBase: options.matchBase === true || options.basename === true,
    platform: options.windows === true || (options.windows === undefined && process.platform === 'win32') ? 'win32' : 'linux',
    // Bound expansions independently of caller-supplied options.
    braceExpandMax: 1024,
  };
}

function buildGlob(patterns, options = {}, returnState = false) {
  options ||= {};
  if (Array.isArray(patterns)) {
    if (patterns.length > MAX_PATTERNS) throw new RangeError('Too many ERP build glob patterns');
    const matchers = patterns.map(pattern => buildGlob(pattern, options, returnState));
    return input => matchers.some(matcher => matcher(input));
  }
  const pattern = validatePattern(patterns);
  const matchOptions = optionsFor(options);
  if (pattern.startsWith('!(')) matchOptions.nonegate = true;
  const matcher = new Minimatch(pattern, matchOptions);
  // The brace library bounds allocation by truncating at its limit. Reject the
  // boundary explicitly so truncation cannot silently change a file filter.
  if (matcher.set.length >= 1024) throw new RangeError('ERP build glob brace expansion limit reached');
  // Picomatch includes the parent itself in a trailing '/**'. Tinyglobby uses
  // this for expandDirectories even when its input is a filename pattern.
  const parentPattern = !matchOptions.noglobstar ? pattern.replace(/(?:\/\*\*)+$/, '') : pattern;
  const parent = parentPattern && parentPattern !== pattern ? new Minimatch(parentPattern, matchOptions) : null;
  if (parent?.set.length >= 1024) throw new RangeError('ERP build glob brace expansion limit reached');
  const ignore = options.ignore ? buildGlob(options.ignore, { ...options, ignore: null, onMatch: null, onIgnore: null, onResult: null }) : () => false;
  const state = scan(patterns, { parts: true });
  const match = (input, returnObject = false) => {
    if (typeof input !== 'string') throw new TypeError('Expected a string to match');
    if (input.length > MAX_INPUT) throw new RangeError('ERP build glob input is too long');
    let output = typeof options.format === 'function' ? options.format(input) : input;
    if (typeof output !== 'string' || output.length > MAX_INPUT) throw new RangeError('ERP build glob formatted input is invalid');
    if (output.startsWith('./')) output = output.slice(2);
    if (options.windows === true || (options.windows === undefined && process.platform === 'win32')) output = output.replaceAll('\\', '/');
    const matches = matcher.match(output);
    const isMatch = parent ? (matcher.negate ? matches && parent.match(output) : matches || parent.match(output)) : matches;
    const result = { glob: patterns, state, input, output, isMatch: output !== '' && isMatch };
    options.onResult?.(result);
    if (result.isMatch && ignore(input)) {
      result.isMatch = false;
      options.onIgnore?.(result);
    } else if (result.isMatch) options.onMatch?.(result);
    result.match = result.isMatch ? [output] : null;
    return returnObject ? result : result.isMatch;
  };
  if (returnState) match.state = state;
  return match;
}

buildGlob.scan = (pattern, options) => { validatePattern(pattern); return scan(pattern, options); };
buildGlob.isMatch = (input, patterns, options) => buildGlob(patterns, options)(input);
// These APIs would reintroduce backtracking or serialize an incorrect predicate
// into a native filter. They are intentionally not emulated or silently ignored.
for (const api of ['makeRe', 'compileRe', 'toRegex', 'parse', 'test', 'matchBase']) {
  buildGlob[api] = () => unsupported(api);
}
module.exports = buildGlob;
