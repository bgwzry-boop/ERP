# Reviewed build-only glob adapter

This is **not** Picomatch with a fabricated fixed version. The implementation
and package identity are `@bagwin/build-glob`, and matching is delegated to
`Minimatch 11.0.9.match()` / `@isaacs/nonrecursive-glob-match` rather than to a
glob-derived JavaScript regular expression. Never call the removed/unsupported
regex-producing APIs as a fallback.

The only retained upstream code is the lexical scanner from Picomatch **4.0.4**:
`lib/scan.js`, SHA-256
`227fcc994a477ea95c5a0435d32783566334c6bd0dcc4a103029735ad8c9c535`.
It is attributed and licensed under the included MIT LICENSE. Its constants and
backslash-removal helper are inlined; its scanner does not compile or execute
the vulnerable repeated-extglob regexes. No upstream parse/picomatch regex
engine is included.

## Exact supported consumers

- Vite 8.3.8 / React plugin 6.3.0, Rolldown 1.2.x instead of old Rollup (whose
  distributed files embed an additional vulnerable matcher).
- Vite's path filters, watcher and filesystem deny filters, plus Tinyglobby/Fdir
  predicates and lexical `scan(..., { parts: true })`.
- File matching: globstars, braces, bracket classes, extglobs, ignores, negation,
  dotfiles, case handling, Windows separators and explicit basename matching.
- Pattern/input/list/brace-expansion limits fail explicitly, not as a success.

This is deliberately not a promise to emulate every Picomatch feature. Raw
regex expansion, captures, Bash cross-separator stars, substring matching and
regex serialization (`makeRe`, `compileRe`, `parse`, `toRegex`) fail explicitly.
The reviewed ERP configurations do not request these APIs. In particular,
Vite's optional custom string `assetsInclude` native-filter compilation is not
enabled here; future use must be reviewed rather than silently produce an
incorrect or backtracking regular expression.

Each project pins the local package using npm overrides and `install-links=true`.
Its real engine remains a separately audited, immutable npm dependency. The
original `npm audit --audit-level=high` steps remain mandatory; passing them
alone is not proof of safety. `check-safe-build-glob.mjs` also verifies engine
resolution, adversarial execution in a bounded worker, real filesystem results,
and compatibility snapshots. All existing business assertions remain unchanged.
