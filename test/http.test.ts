import { etagMatches, fetchWithRetry, upstreamError } from "@/utils/http.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Each path answers with the scripted statuses in order, then 200
const scripts: Record<string, { status: number; headers?: Record<string, string> }[]> = {};
const hits: Record<string, number> = {};

const server = http.createServer((req, res) => {
	const path = req.url ?? "/";
	hits[path] = (hits[path] ?? 0) + 1;
	const step = scripts[path]?.shift();
	res.writeHead(step?.status ?? 200, step?.headers);
	res.end(step ? "error" : "ok");
});

let base = "";

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
	server.close();
});

describe("fetchWithRetry", () => {
	it("retries a 429 after Retry-After, then a 5xx", async () => {
		scripts["/flaky"] = [{ status: 429, headers: { "Retry-After": "1" } }, { status: 503 }];
		const response = await fetchWithRetry("test", `${base}/flaky`);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(hits["/flaky"]).toBe(3);
	});

	it("gives up right away on a long Retry-After", async () => {
		scripts["/banned"] = [{ status: 429, headers: { "Retry-After": "3600" } }];
		const response = await fetchWithRetry("test", `${base}/banned`);

		expect(response.status).toBe(429);
		expect(hits["/banned"]).toBe(1);
	});

	it("does not retry other client errors", async () => {
		scripts["/missing"] = [{ status: 404 }];
		const response = await fetchWithRetry("test", `${base}/missing`);

		expect(response.status).toBe(404);
		expect(hits["/missing"]).toBe(1);
	});
});

describe("upstreamError", () => {
	it.each([
		[404, 404],
		[429, 429],
		[400, 502],
		[500, 502],
	])("maps a Spotify %i to %i", async (upstream, expected) => {
		const error = await upstreamError("Spotify", new Response("details", { status: upstream }));
		expect(error.status).toBe(expected);
		expect(error.message).toContain("details");
	});

	it("uses the given status when there is one", async () => {
		const error = await upstreamError("Spotify", new Response("", { status: 400 }), 401);
		expect(error.status).toBe(401);
	});
});

describe("etagMatches", () => {
	const etag = 'W/"abc"';

	it.each([
		['W/"abc"', true],
		['"abc"', true],
		['"other", W/"abc"', true],
		["*", true],
		['"other"', false],
		[undefined, false],
	])("If-None-Match %s -> %s", (header, expected) => {
		expect(etagMatches(header, etag)).toBe(expected);
	});
});
