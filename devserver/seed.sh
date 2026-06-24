#!/bin/zsh
B=wrangler-validation
d=$(mktemp -d)
put() { npx wrangler r2 object put "$B/$1" --file "$2" --local --persist-to ./mfstate "${@:3}" >/dev/null 2>&1 && echo "seeded $1" || echo "FAILED $1"; }

printf '0123456789' > "$d/range";      put "range-key" "$d/range"
printf ''           > "$d/empty";      put "empty-key" "$d/empty"
printf 'conditional'> "$d/cond";       put "cond-key" "$d/cond"
printf 'deep'       > "$d/deep";       put "nested/a/b/c.txt" "$d/deep"
printf 'spaced'     > "$d/spaced";     put "with space.txt" "$d/spaced"
printf 'uni'        > "$d/uni";        put "unicode-éè.txt" "$d/uni"
printf 'percent'    > "$d/pct";        put "100%/a%2Bb.txt" "$d/pct"
printf 'plain text body' > "$d/txt";   put "type-text" "$d/txt" --content-type "text/plain; charset=utf-8"
printf '<h1>hi</h1>'> "$d/html";       put "type-html" "$d/html" --content-type "text/html"
printf 'not-really-a-png' > "$d/png";  put "type-png" "$d/png" --content-type "image/png"
printf 'metadata-body' > "$d/meta";    put "meta-key" "$d/meta" --content-type "application/json" --cache-control "max-age=3600" --content-disposition 'attachment; filename="x.json"' --content-encoding "identity" --content-language "en-US"
