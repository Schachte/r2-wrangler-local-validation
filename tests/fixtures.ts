import type { Fixture } from "../lib.ts";

export const FIXTURES: Fixture[] = [
	{ key: "range-key", body: "0123456789" },
	{ key: "empty-key", body: "" },
	{ key: "100%/a%2Bb.txt", body: "percent" },
	{ key: "cond-key", body: "conditional" },
	{ key: "nested/a/b/c.txt", body: "deep" },
	{ key: "with space.txt", body: "spaced" },
	{ key: "unicode-\u00e9\u00e8.txt", body: "uni" },
	{
		key: "meta-key",
		body: "metadata-body",
		contentType: "application/json",
		cacheControl: "max-age=3600",
		contentDisposition: 'attachment; filename="x.json"',
		contentEncoding: "identity",
		contentLanguage: "en-US",
	},
	{ key: "type-text", body: "plain text body", contentType: "text/plain; charset=utf-8" },
	{ key: "type-html", body: "<h1>hi</h1>", contentType: "text/html" },
	{ key: "type-png", body: "not-really-a-png", contentType: "image/png" },
];
