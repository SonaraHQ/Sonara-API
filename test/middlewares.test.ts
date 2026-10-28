import { rateLimit } from "@/middlewares/rate-limit.js";
import { onError } from "@/middlewares/error.js";
import { apiKey } from "@/middlewares/auth.js";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";

function newApp(...middlewares: Parameters<Hono["use"]>[1][]) {
	const app = new Hono();
	for (const middleware of middlewares) app.use(middleware);
	app.get("/", (c) => c.json({ ok: true }));
	app.onError(onError);
	return app;
}

describe("apiKey", () => {
	const app = newApp(apiKey("secret"));

	it.each([
		["Authorization header", "/", { Authorization: "Bearer secret" }],
		["X-API-Key header", "/", { "X-API-Key": "secret" }],
		["key query param", "/?key=secret", {}],
	])("accepts the key from the %s", async (_, path, headers) => {
		expect((await app.request(path, { headers })).status).toBe(200);
	});

	it.each([
		["no key", {}],
		["a wrong key", { "X-API-Key": "wrong" }],
		["a key prefix", { "X-API-Key": "secre" }],
	])("rejects %s with a JSON 401", async (_, headers) => {
		const response = await app.request("/", { headers });
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Invalid or missing API key" });
	});
});

describe("rateLimit", () => {
	it("answers 429 with Retry-After once the limit is reached", async () => {
		const app = newApp(rateLimit(2));

		const statuses = [];
		for (let i = 0; i < 3; i++) statuses.push((await app.request("/")).status);
		const blocked = await app.request("/");

		expect(statuses).toEqual([200, 200, 429]);
		expect(blocked.headers.get("X-RateLimit-Remaining")).toBe("0");
		expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
		expect(await blocked.json()).toEqual({ error: "Too many requests" });
	});
});
