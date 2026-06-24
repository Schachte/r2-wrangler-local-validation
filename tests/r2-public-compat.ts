import { run, type Capture, type Case } from "../lib.ts";
import { FIXTURES } from "./fixtures.ts";

type Fields = (keyof Capture)[];

const PAST = "Tue, 01 Jan 2008 00:00:00 GMT";
const FUTURE = "Fri, 01 Jan 2100 00:00:00 GMT";

const FULL: Fields = ["status", "contentType", "contentLength", "acceptRanges", "hasEtag", "bodyLen", "bodyBase64"];
const RANGE: Fields = ["status", "contentRange", "contentLength", "bodyLen", "bodyBase64"];
const HEAD_RANGE: Fields = ["status", "contentRange", "contentLength", "bodyLen"];
const META: Fields = [
	"status",
	"contentType",
	"cacheControl",
	"contentDisposition",
	"contentEncoding",
	"contentLanguage",
	"contentLength",
	"bodyLen",
	"bodyBase64",
];

const reads: Case[] = [
	{ name: "get-200", path: "/range-key", compare: FULL },
	{ name: "head-200", path: "/range-key", method: "HEAD", compare: ["status", "contentLength", "bodyLen"] },
	{ name: "empty-object", path: "/empty-key", compare: FULL },
	{ name: "nested-key", path: "/nested/a/b/c.txt", compare: FULL },
	{ name: "space-key", path: "/with%20space.txt", compare: FULL },
	{ name: "unicode-key", path: "/unicode-%C3%A9%C3%A8.txt", compare: FULL },
	{ name: "percent-key", path: "/100%25/a%252Bb.txt", compare: FULL },
	{ name: "query-ignored", path: "/range-key?foo=bar", compare: FULL },
	{ name: "missing-key", path: "/does-not-exist", compare: ["status"] },
	{ name: "head-missing", path: "/does-not-exist", method: "HEAD", compare: ["status"] },
];

const CONTENT_TYPE: Fields = ["status", "contentType", "bodyBase64"];

const metadata: Case[] = [
	{ name: "metadata-get", path: "/meta-key", compare: META },
	{ name: "metadata-head", path: "/meta-key", method: "HEAD", compare: META },
	{ name: "content-type-text", path: "/type-text", compare: CONTENT_TYPE },
	{ name: "content-type-html", path: "/type-html", compare: CONTENT_TYPE },
	{ name: "content-type-png", path: "/type-png", compare: CONTENT_TYPE },
	{ name: "content-type-head", path: "/type-png", method: "HEAD", compare: ["status", "contentType"] },
];

const ranges: Case[] = [
	{ name: "range-first", path: "/range-key", headers: { Range: "bytes=0-3" }, compare: RANGE },
	{ name: "range-single-byte", path: "/range-key", headers: { Range: "bytes=0-0" }, compare: RANGE },
	{ name: "range-last-byte", path: "/range-key", headers: { Range: "bytes=9-9" }, compare: RANGE },
	{ name: "range-open-ended", path: "/range-key", headers: { Range: "bytes=5-" }, compare: RANGE },
	{ name: "range-full-open", path: "/range-key", headers: { Range: "bytes=0-" }, compare: RANGE },
	{ name: "range-end-beyond", path: "/range-key", headers: { Range: "bytes=0-100" }, compare: RANGE },
	{ name: "range-suffix", path: "/range-key", headers: { Range: "bytes=-4" }, compare: RANGE },
	{ name: "range-suffix-eq", path: "/range-key", headers: { Range: "bytes=-10" }, compare: RANGE },
	{ name: "range-suffix-over", path: "/range-key", headers: { Range: "bytes=-100" }, compare: RANGE },
	{ name: "head-range", path: "/range-key", method: "HEAD", headers: { Range: "bytes=0-3" }, compare: HEAD_RANGE },
];

const badRanges: Case[] = [
	{ name: "range-malformed", path: "/range-key", headers: { Range: "bytes=zzz" }, compare: ["status"] },
	{ name: "range-multi", path: "/range-key", headers: { Range: "bytes=0-1,3-4" }, compare: ["status"] },
	{ name: "range-inverted", path: "/range-key", headers: { Range: "bytes=5-2" }, compare: ["status"] },
	{ name: "range-no-prefix", path: "/range-key", headers: { Range: "0-3" }, compare: ["status"] },
	{ name: "range-whitespace", path: "/range-key", headers: { Range: "bytes= 0-3" }, compare: ["status"] },
	{ name: "range-unsat", path: "/range-key", headers: { Range: "bytes=99999-" }, compare: ["status"] },
	{ name: "range-zero-suffix", path: "/range-key", headers: { Range: "bytes=-0" }, compare: ["status"] },
	{ name: "range-empty-obj", path: "/empty-key", headers: { Range: "bytes=-5" }, compare: ["status"] },
];

const conditionals: Case[] = [
	{ name: "inm-match", path: "/cond-key", headers: { "If-None-Match": "{etag}" }, compare: ["status"] },
	{ name: "inm-star", path: "/cond-key", headers: { "If-None-Match": "*" }, compare: ["status"] },
	{ name: "inm-mismatch", path: "/cond-key", headers: { "If-None-Match": '"deadbeef"' }, compare: ["status", "bodyLen", "bodyBase64"] },
	{ name: "im-match", path: "/cond-key", headers: { "If-Match": "{etag}" }, compare: ["status", "bodyLen", "bodyBase64"] },
	{ name: "im-star", path: "/cond-key", headers: { "If-Match": "*" }, compare: ["status", "bodyLen", "bodyBase64"] },
	{ name: "im-fail", path: "/cond-key", headers: { "If-Match": '"deadbeef"' }, compare: ["status"] },
	{ name: "ims-future", path: "/cond-key", headers: { "If-Modified-Since": FUTURE }, compare: ["status"] },
	{ name: "ims-past", path: "/cond-key", headers: { "If-Modified-Since": PAST }, compare: ["status", "bodyLen", "bodyBase64"] },
	{ name: "ius-future", path: "/cond-key", headers: { "If-Unmodified-Since": FUTURE }, compare: ["status", "bodyLen", "bodyBase64"] },
	{ name: "ius-past", path: "/cond-key", headers: { "If-Unmodified-Since": PAST }, compare: ["status"] },
	{ name: "head-inm-match", path: "/cond-key", method: "HEAD", headers: { "If-None-Match": "{etag}" }, compare: ["status"] },
	{ name: "head-im-fail", path: "/cond-key", method: "HEAD", headers: { "If-Match": '"deadbeef"' }, compare: ["status"] },
];

const methods: Case[] = [
	{ name: "write-put", path: "/range-key", method: "PUT", headers: { "Content-Type": "text/plain" }, compare: ["status"] },
	{ name: "write-post", path: "/range-key", method: "POST", compare: ["status"] },
	{ name: "write-delete", path: "/range-key", method: "DELETE", compare: ["status"] },
	{ name: "write-patch", path: "/range-key", method: "PATCH", compare: ["status"] },
];

const CASES: Case[] = [...reads, ...metadata, ...ranges, ...badRanges, ...conditionals, ...methods];

void run(CASES, FIXTURES);
