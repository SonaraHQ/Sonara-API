import { createHash, timingSafeEqual } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";

const digest = (value: string) => createHash("sha256").update(value).digest();

// Accepts `Authorization: Bearer <key>`, `X-API-Key: <key>` or `?key=<key>` (for clients that only take a URL, like LavaSrc)
export function apiKey(key: string): MiddlewareHandler {
	// Compared as fixed-length digests in constant time, so neither the key nor its length leaks
	const expected = digest(key);

	return async (c, next) => {
		const provided = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") || c.req.header("x-api-key") || c.req.query("key");
		if (!provided || !timingSafeEqual(digest(provided), expected)) throw new HTTPException(401, { message: "Invalid or missing API key" });
		await next();
	};
}
