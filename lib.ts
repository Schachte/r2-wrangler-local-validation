import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type Fixture = {
	key: string;
	body: string;
	contentType?: string;
	cacheControl?: string;
	contentDisposition?: string;
	contentEncoding?: string;
	contentLanguage?: string;
};

export type Capture = {
	status: number;
	contentRange: string | null;
	contentLength: string | null;
	acceptRanges: string | null;
	contentType: string | null;
	cacheControl: string | null;
	contentDisposition: string | null;
	contentEncoding: string | null;
	contentLanguage: string | null;
	hasEtag: boolean;
	bodyLen: number;
	bodyBase64: string;
};

export type Case = {
	name: string;
	path: string;
	method?: string;
	headers?: Record<string, string>;
	compare: (keyof Capture)[];
};

type Diff = { field: keyof Capture; remote: unknown; local: unknown };
type Result = { case: Case; remote: Capture; local: Capture; diffs: Diff[] };

const verbose = process.env.VERBOSE === "1" || process.argv.includes("--verbose");
const noColor = process.env.NO_COLOR === "1" || process.env.NO_COLOR === "true";
const color = (code: number, text: string): string => (noColor ? text : `\x1b[${code}m${text}\x1b[0m`);
const bold = (text: string): string => color(1, text);
const dim = (text: string): string => color(2, text);
const green = (text: string): string => color(32, text);
const red = (text: string): string => color(31, text);
const yellow = (text: string): string => color(33, text);

function need(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing env var: ${name} (copy .env.example to .env)`);
		process.exit(2);
	}
	return value;
}

function failureLimit(): number {
	const value = Number(process.env.FAILURE_LIMIT ?? 20);
	return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 20;
}

function metaFlags(f: Fixture): string[] {
	const flags: [string, string | undefined][] = [
		["--content-type", f.contentType],
		["--cache-control", f.cacheControl],
		["--content-disposition", f.contentDisposition],
		["--content-encoding", f.contentEncoding],
		["--content-language", f.contentLanguage],
	];
	return flags.flatMap(([flag, value]) => (value === undefined ? [] : [flag, value]));
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function localStateRoot(wranglerCwd: string): string {
	const persistTo = process.env.LOCAL_PERSIST;
	if (!persistTo) {
		return join(wranglerCwd, ".wrangler", "state", "v3");
	}
	return isAbsolute(persistTo) ? persistTo : join(wranglerCwd, persistTo);
}

function localR2ObjectDbPaths(wranglerCwd: string): string[] {
	const objectStoreDir = join(localStateRoot(wranglerCwd), "r2", "miniflare-R2BucketObject");
	return readdirSync(objectStoreDir)
		.filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
		.map((name) => join(objectStoreDir, name));
}

function renameLocalObjectKey(wranglerCwd: string, from: string, to: string): void {
	let renamed = false;
	for (const dbPath of localR2ObjectDbPaths(wranglerCwd)) {
		const count = Number(execFileSync("sqlite3", [dbPath, `SELECT COUNT(*) FROM _mf_objects WHERE key = ${sqlString(from)};`]).toString().trim());
		if (count === 0) {
			continue;
		}
		execFileSync(
			"sqlite3",
			[
				dbPath,
				[
					`DELETE FROM _mf_objects WHERE key = ${sqlString(to)};`,
					`UPDATE _mf_objects SET key = ${sqlString(to)} WHERE key = ${sqlString(from)};`,
				].join("\n"),
			],
			{ stdio: "ignore" }
		);
		renamed = true;
	}
	if (!renamed) {
		throw new Error(`Could not find local R2 metadata row for ${from}`);
	}
}

async function seed(fixtures: Fixture[]): Promise<void> {
	const bucket = need("R2_BUCKET");
	const wranglerCwd = process.env.WRANGLER_CWD ?? process.cwd();
	const persistTo = process.env.LOCAL_PERSIST ? ["--persist-to", process.env.LOCAL_PERSIST] : [];
	const s3 = new S3Client({
		region: "auto",
		endpoint: need("R2_S3_ENDPOINT"),
		credentials: {
			accessKeyId: need("R2_ACCESS_KEY_ID"),
			secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
		},
	});
	const dir = mkdtempSync(join(tmpdir(), "r2compat-"));
	for (const f of fixtures) {
		const body = Buffer.from(f.body);
		await s3.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: f.key,
				Body: body,
				ContentLength: body.byteLength,
				ContentType: f.contentType,
				CacheControl: f.cacheControl,
				ContentDisposition: f.contentDisposition,
				ContentEncoding: f.contentEncoding,
				ContentLanguage: f.contentLanguage,
			})
		);
		const file = join(dir, encodeURIComponent(f.key));
		const localKey = f.key.replaceAll("%", "%25");
		writeFileSync(file, body);
		execFileSync(
			"npx",
			["wrangler", "r2", "object", "put", `${bucket}/${localKey}`, "--file", file, "--local", ...persistTo, ...metaFlags(f)],
			{ cwd: wranglerCwd, stdio: "ignore" }
		);
		if (localKey !== f.key) {
			renameLocalObjectKey(wranglerCwd, localKey, f.key);
		}
	}
}

function normalize(base: string): string {
	return base.replace(/\/+$/, "");
}

async function resolveHeaders(label: string, base: string, c: Case): Promise<Record<string, string>> {
	const headers = { ...c.headers };
	if (!Object.values(headers).some((value) => value.includes("{etag}"))) {
		return headers;
	}
	const warm = await fetch(base + c.path, { redirect: "manual" });
	await warm.arrayBuffer();
	const etag = warm.headers.get("etag");
	if (!etag) {
		throw new Error(`${label} warmup did not return an ETag for ${c.name} (${c.path}, status ${warm.status})`);
	}
	return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, value.replace("{etag}", etag)]));
}

async function probe(label: string, base: string, c: Case): Promise<Capture> {
	const res = await fetch(base + c.path, { method: c.method ?? "GET", headers: await resolveHeaders(label, base, c), redirect: "manual" });
	const buf = Buffer.from(await res.arrayBuffer());
	return {
		status: res.status,
		contentRange: res.headers.get("content-range"),
		contentLength: res.headers.get("content-length"),
		acceptRanges: res.headers.get("accept-ranges"),
		contentType: res.headers.get("content-type"),
		cacheControl: res.headers.get("cache-control"),
		contentDisposition: res.headers.get("content-disposition"),
		contentEncoding: res.headers.get("content-encoding"),
		contentLanguage: res.headers.get("content-language"),
		hasEtag: res.headers.has("etag"),
		bodyLen: buf.byteLength,
		bodyBase64: buf.toString("base64"),
	};
}

function compare(c: Case, remote: Capture, local: Capture): Diff[] {
	const diffs: Diff[] = [];
	for (const field of c.compare) {
		try {
			assert.strictEqual(local[field], remote[field], `${c.name}.${field}`);
		} catch {
			diffs.push({ field, remote: remote[field], local: local[field] });
		}
	}
	return diffs;
}

function value(v: unknown): string {
	return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function captureLine(label: string, capture: Capture, fields: (keyof Capture)[]): string {
	return `${label}[${fields.map((field) => `${String(field)}=${value(capture[field])}`).join(" ")}]`;
}

function printVerbose(results: Result[]): void {
	if (!verbose) {
		return;
	}
	console.log(bold("Captures"));
	for (const r of results) {
		const mark = r.diffs.length ? red("F") : green(".");
		console.log(`${mark} ${r.case.name} ${dim(`${r.case.method ?? "GET"} ${r.case.path}`)}`);
		console.log(`  ${captureLine("remote", r.remote, r.case.compare)}`);
		console.log(`  ${captureLine("local ", r.local, r.case.compare)}`);
	}
	console.log("");
}

function printFailures(results: Result[]): void {
	const failures = results.filter((r) => r.diffs.length > 0);
	if (failures.length === 0) {
		return;
	}
	const limit = failureLimit();
	const shown = limit === 0 ? failures : failures.slice(0, limit);
	console.log(bold(red("Failures")));
	for (const r of shown) {
		const first = r.diffs[0]!;
		const rest = r.diffs.length > 1 ? dim(` (+${r.diffs.length - 1} fields)`) : "";
		console.log(`${red("F")} ${r.case.name} ${dim(`${r.case.method ?? "GET"} ${r.case.path}`)} ${yellow(String(first.field))}${rest}`);
		console.log(`  remote: ${value(first.remote)}`);
		console.log(`  local:  ${value(first.local)}`);
	}
	const hidden = failures.length - shown.length;
	if (hidden > 0) {
		console.log(dim(`... ${hidden} more failure${hidden === 1 ? "" : "s"} hidden by FAILURE_LIMIT=${limit}; use FAILURE_LIMIT=0 to show all.`));
	}
	console.log("");
}

export async function run(cases: Case[], fixtures: Fixture[]): Promise<void> {
	const started = Date.now();
	const remoteBase = normalize(need("REMOTE"));
	const localBase = normalize(need("LOCAL"));
	if (remoteBase === localBase) {
		console.error("REMOTE and LOCAL resolve to the same base URL; refusing to run a self-comparison.");
		process.exit(2);
	}

	console.log(bold("R2 public compatibility"));
	if (process.env.SKIP_SEED === "1") {
		console.log(dim("Seeding skipped"));
	} else {
		process.stdout.write(dim(`Seeding ${fixtures.length} fixtures... `));
		await seed(fixtures);
		console.log(green("done"));
	}

	process.stdout.write(dim(`Running ${cases.length} comparisons... `));
	const results: Result[] = [];
	for (const c of cases) {
		const remote = await probe("remote", remoteBase, c);
		const local = await probe("local", localBase, c);
		const diffs = compare(c, remote, local);
		results.push({ case: c, remote, local, diffs });
		process.stdout.write(diffs.length ? red("F") : green("."));
	}
	console.log("\n");

	printVerbose(results);
	printFailures(results);

	const failed = results.filter((r) => r.diffs.length > 0).length;
	const passed = cases.length - failed;
	console.log(`${bold("Summary")} ${passed}/${cases.length} passed (${failed} failed, ${Date.now() - started}ms)`);
	process.exitCode = failed ? 1 : 0;
}
