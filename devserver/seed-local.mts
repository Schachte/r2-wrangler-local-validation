import { FIXTURES } from "../tests/fixtures.ts";

const BASE = "http://127.0.0.1:8787/__seed/";

function headers(f: (typeof FIXTURES)[number]): HeadersInit {
	return Object.fromEntries(
		[
			["x-ct", f.contentType],
			["x-cc", f.cacheControl],
			["x-cd", f.contentDisposition],
			["x-ce", f.contentEncoding],
			["x-cl", f.contentLanguage],
		].filter((entry): entry is [string, string] => entry[1] !== undefined)
	);
}

for (const f of FIXTURES) {
	const res = await fetch(BASE + encodeURIComponent(f.key), { method: "PUT", headers: headers(f), body: f.body });
	console.log(`${res.status} ${f.key}`);
}
