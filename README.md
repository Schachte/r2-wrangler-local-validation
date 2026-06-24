# R2 <> Wrangler Compat

[![compat](https://github.com/Schachte/r2-wrangler-local-validation/actions/workflows/test.yml/badge.svg)](https://github.com/Schachte/r2-wrangler-local-validation/actions/workflows/test.yml)

Checks that miniflare's local R2 public endpoint (`/cdn-cgi/local/r2/public`)
behaves like a real `r2.dev` bucket. Sample data is seeded into both systems for a 1:1 comparison.

<!-- TEST-RESULTS:START -->
![tests](https://img.shields.io/badge/tests-43%2F50%20passed-red)

**7 of 50 compat checks failing:**

- `get-200 GET /range-key`
- `empty-object GET /empty-key`
- `nested-key GET /nested/a/b/c.txt`
- `space-key GET /with%20space.txt`
- `unicode-key GET /unicode-%C3%A9%C3%A8.txt`
- `percent-key GET /100%25/a%252Bb.txt`
- `query-ignored GET /range-key?foo=bar`
- `get-200 GET /range-key contentType (+1 fields)`
- `empty-object GET /empty-key contentType (+1 fields)`
- `nested-key GET /nested/a/b/c.txt contentType (+1 fields)`
- `space-key GET /with%20space.txt contentType (+1 fields)`
- `unicode-key GET /unicode-%C3%A9%C3%A8.txt contentType (+1 fields)`
- `percent-key GET /100%25/a%252Bb.txt contentType (+1 fields)`
- `query-ignored GET /range-key?foo=bar contentType (+1 fields)`
<!-- TEST-RESULTS:END -->

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

Local fixtures are seeded through Wrangler local state by default. Set
`LOCAL_SEED=http://localhost:8787/__seed` only when the local Worker exposes a
`PUT /__seed/<key>` route for seeding the same bucket.

| Group | Checks |
|-------|--------|
| reads | GET/HEAD 200, empty object, nested/spaced/unicode/percent keys, 404s |
| metadata | Content-Type, Cache-Control, Content-Disposition, etc. come back unchanged |
| ranges | normal, single-byte, suffix, open-ended, over-size clamping, ranged HEAD |
| bad ranges | malformed/multiple/inverted → 400, unsatisfiable → 416 |
| conditionals | If-None-Match / If-Match / If-Modified-Since → correct 304 vs 412 |
| methods | PUT/POST/DELETE/PATCH → 401 |
