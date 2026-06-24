# R2 <> Wrangler Compat

Checks that miniflare's local R2 public endpoint (`/cdn-cgi/local/r2/public`)
behaves like a real `r2.dev` bucket. Sample data is seeded into both systems for a 1:1 comparison.



## Setup

```sh
npm install
cp .env.example .env
```

## Run

_Set `SKIP_SEED=1` to reuse existing objects._

```sh
npm test
npm run typecheck
```

By default, `npm test` prints compact colored progress plus a final failure
summary. Use `VERBOSE=1 npm test` to include every remote/local capture.


| Group | Checks |
|-------|--------|
| reads | GET/HEAD 200, empty object, nested/spaced/unicode/percent keys, 404s |
| metadata | Content-Type, Cache-Control, Content-Disposition, etc. come back unchanged |
| ranges | normal, single-byte, suffix, open-ended, over-size clamping, ranged HEAD |
| bad ranges | malformed/multiple/inverted → 400, unsatisfiable → 416 |
| conditionals | If-None-Match / If-Match / If-Modified-Since → correct 304 vs 412 |
| methods | PUT/POST/DELETE/PATCH → 401 |
