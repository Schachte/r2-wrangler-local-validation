interface Env {
	BUCKET: R2Bucket;
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		if (req.method === "PUT" && url.pathname.startsWith("/__seed/")) {
			const key = decodeURIComponent(url.pathname.slice("/__seed/".length));
			const httpMetadata: R2HTTPMetadata = {};
			const ct = req.headers.get("x-ct");
			const cc = req.headers.get("x-cc");
			const cd = req.headers.get("x-cd");
			const ce = req.headers.get("x-ce");
			const cl = req.headers.get("x-cl");
			if (ct) httpMetadata.contentType = ct;
			if (cc) httpMetadata.cacheControl = cc;
			if (cd) httpMetadata.contentDisposition = cd;
			if (ce) httpMetadata.contentEncoding = ce;
			if (cl) httpMetadata.contentLanguage = cl;
			await env.BUCKET.put(key, await req.arrayBuffer(), { httpMetadata });
			return new Response("seeded");
		}
		return new Response("ok");
	},
};
