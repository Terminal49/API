# Vendored anti-slop rules

These Oxlint rules are vendored from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) at revision
`446268e5d15baa968eaec669ff65358d36ae6259`.

The files are intentionally owned by this repository. Review upstream changes
before updating them and preserve Terminal49-specific severities in the root
`vite.config.ts`.

## Local modifications

Re-apply these when re-vendoring from upstream:

- `rules/no-module-mocking.ts` — also recognizes `vi` imported from
  `vite-plus/test` (upstream only knows the `vitest` module specifier). This
  repository imports test APIs from `vite-plus/test`, so dropping the patch
  silently blinds the rule to every test file.
