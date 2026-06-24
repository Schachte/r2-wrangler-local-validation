Checks that miniflare's local R2 public endpoint (`/cdn-cgi/local/r2/public`)
behaves like a real `r2.dev` bucket. Sample data is seeded into both systems for a 1:1 comparison.

_See the [latest build](https://github.com/Schachte/r2-wrangler-local-validation/actions/workflows/test.yml)._ 
[![compat](https://github.com/Schachte/r2-wrangler-local-validation/actions/workflows/test.yml/badge.svg)](https://github.com/Schachte/r2-wrangler-local-validation/actions/workflows/test.yml)


## Setup

```sh
npm install
cp .env.example .env
```

## Run

_Set `SKIP_SEED=1` to reuse existing objects._

```sh
npm test
```

| Group | Checks |
|-------|--------|
| reads | GET/HEAD 200, empty object, nested/spaced/unicode/percent keys, 404s |
| metadata | Content-Type, Cache-Control, Content-Disposition, etc. come back unchanged |
| ranges | normal, single-byte, suffix, open-ended, over-size clamping, ranged HEAD |
| bad ranges | malformed/multiple/inverted → 400, unsatisfiable → 416 |
| conditionals | If-None-Match / If-Match / If-Modified-Since → correct 304 vs 412 |
| methods | PUT/POST/DELETE/PATCH → 401 |
