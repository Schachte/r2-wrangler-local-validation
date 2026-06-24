import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function need(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing env var: ${name} (copy .env.example to .env)`);
		process.exit(2);
	}
	return value;
}

function wranglerMetaFlags(f: Fixture): string[] {
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

function localR2ObjectDbPaths(wranglerCwd: string): string[] {
	const objectStoreDir = join(wranglerCwd, ".wrangler", "state", "v3", "r2", "miniflare-R2BucketObject");
	return readdirSync(objectStoreDir)
		.filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
		.map((name) => join(objectStoreDir, name));
}

function renameLocalObjectKey(wranglerCwd: string, from: string, to: string): void {
	let renamed = false;
	for (const dbPath of localR2ObjectDbPaths(wranglerCwd)) {
		const count = Number(
			execFileSync("sqlite3", [dbPath, `SELECT COUNT(*) FROM _mf_objects WHERE key = ${sqlString(from)};`], {
				encoding: "utf8",
			}).trim()
		);
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

function wranglerLocalKey(key: string): string {
	return key.replaceAll("%", "%25");
}

async function seed(fixtures: Fixture[]): Promise<void> {
	const bucket = need("R2_BUCKET");
	const wranglerCwd = process.env.WRANGLER_CWD ?? process.cwd();
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
		await s3.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: f.key,
				Body: f.body,
				ContentType: f.contentType,
				CacheControl: f.cacheControl,
				ContentDisposition: f.contentDisposition,
				ContentEncoding: f.contentEncoding,
				ContentLanguage: f.contentLanguage,
			})
		);
		const file = join(dir, encodeURIComponent(f.key));
		writeFileSync(file, f.body);
		const localKey = wranglerLocalKey(f.key);
		execFileSync(
			"npx",
			["wrangler", "r2", "object", "put", `${bucket}/${localKey}`, "--file", file, "--local", ...wranglerMetaFlags(f)],
			{ cwd: wranglerCwd, stdio: "ignore" }
		);
		if (localKey !== f.key) {
			// Wrangler's local R2 command rejects raw "%" in object paths, so rename the
			// local metadata row after uploading with the escaped spelling.
			renameLocalObjectKey(wranglerCwd, localKey, f.key);
		}
	}
	console.log(`Seeded ${fixtures.length} fixtures (remote + local)`);
}

function normalizeBase(base: string): string {
	return base.replace(/\/+$/, "");
}

function requestUrl(base: string, path: string): string {
	return normalizeBase(base) + path;
}

async function resolveHeaders(
	label: string,
	base: string,
	path: string,
	headers: Record<string, string>
): Promise<Record<string, string>> {
	if (!Object.values(headers).some((v) => v.includes("{etag}"))) {
		return headers;
	}
	const warm = await fetch(requestUrl(base, path), { redirect: "manual" });
	await warm.arrayBuffer();
	const etag = warm.headers.get("etag");
	if (!etag) {
		throw new Error(`${label} warmup did not return an ETag for ${path} (status ${warm.status})`);
	}
	return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, v.replace("{etag}", etag)]));
}

async function probe(label: string, base: string, c: Case): Promise<Capture> {
	const headers = await resolveHeaders(label, base, c.path, { ...c.headers });
	const res = await fetch(requestUrl(base, c.path), { method: c.method ?? "GET", headers, redirect: "manual" });
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

function fmt(c: Capture, fields: (keyof Capture)[]): string {
	return fields.map((f) => `${f}=${String(c[f])}`).join(" ");
}

export async function run(cases: Case[], fixtures: Fixture[]): Promise<void> {
	const remoteBase = normalizeBase(need("REMOTE"));
	const localBase = normalizeBase(need("LOCAL"));
	if (remoteBase === localBase) {
		console.error("REMOTE and LOCAL resolve to the same base URL; refusing to run a self-comparison.");
		process.exit(2);
	}
	if (process.env.SKIP_SEED !== "1") {
		await seed(fixtures);
	}
	console.log("");
	let failures = 0;
	for (const c of cases) {
		const remote = await probe("remote", remoteBase, c);
		const local = await probe("local", localBase, c);
		const ok = c.compare.every((f) => remote[f] === local[f]);
		if (!ok) {
			failures++;
		}
		console.log(
			`${ok ? "OK  " : "DIFF"}  ${c.name.padEnd(20)}  remote[${fmt(remote, c.compare)}]  local[${fmt(local, c.compare)}]`
		);
	}
	console.log(`\n${cases.length - failures}/${cases.length} matched`);
	process.exit(failures ? 1 : 0);
}
