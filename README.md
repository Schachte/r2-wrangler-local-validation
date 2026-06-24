# R2 <> Wrangler Compat

Checks that miniflare's local R2 public endpoint (`/cdn-cgi/local/r2/public`)
behaves like a real `r2.dev` bucket. 

## Setup

```sh
npm install
cp .env.example .env
```

## Run

```sh
npm run compat
npm run typecheck
```

Set `SKIP_SEED=1` to reuse existing objects.

| Group | Checks |
|-------|--------|
| reads | GET/HEAD 200, empty object, nested/spaced/unicode/percent keys, 404s |
| metadata | Content-Type, Cache-Control, Content-Disposition, etc. come back unchanged |
| ranges | normal, single-byte, suffix, open-ended, over-size clamping, ranged HEAD |
| bad ranges | malformed/multiple/inverted → 400, unsatisfiable → 416 |
| conditionals | If-None-Match / If-Match / If-Modified-Since → correct 304 vs 412 |
| methods | PUT/POST/DELETE/PATCH → 401 |
