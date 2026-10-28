import type { ContentfulStatusCode } from "hono/utils/http-status";
import { setTimeout as sleep } from "node:timers/promises";
import { HTTPException } from "hono/http-exception";
import { logs } from "@/utils/logger.js";

// Covers the whole exchange, body included: a hung Spotify call must not block the in-flight cache forever
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
// A longer Retry-After means a real ban: fail now instead of holding the request
const MAX_RETRY_DELAY_MS = 10_000;

function retryDelay(attempt: number, retryAfterHeader?: string | null): number {
	const retryAfter = Number(retryAfterHeader);
	const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
	// Jitter so parallel batches hit by the same 429 do not all come back at once
	return base + Math.random() * 500;
}

// fetch with a timeout, retried on network errors, 429 and 5xx (honoring Retry-After)
export async function fetchWithRetry(label: string, url: string, init: RequestInit = {}): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		} catch (err) {
			const timedOut = (err as Error).name === "TimeoutError";
			if (attempt >= MAX_RETRIES) throw new HTTPException(timedOut ? 504 : 502, { message: `${label} -> ${timedOut ? "timed out" : (err as Error).message}` });

			logs("warn", `${label} failed (${timedOut ? "timeout" : (err as Error).message}), retry ${attempt + 1}/${MAX_RETRIES}`);
			await sleep(retryDelay(attempt));
			continue;
		}

		if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
			const delay = retryDelay(attempt, response.headers.get("retry-after"));
			if (delay <= MAX_RETRY_DELAY_MS + 500) {
				await response.body?.cancel();
				logs("warn", `${label} -> ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
				await sleep(delay);
				continue;
			}
		}

		return response;
	}
}

// If-None-Match check, weak comparison as compression may change the bytes on the wire
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
	if (!ifNoneMatch) return false;
	const strip = (tag: string) => tag.trim().replace(/^W\//, "");
	return ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || strip(tag) === strip(etag));
}

// Maps a failed Spotify response to the status our client should see (404 and 429 pass through, the rest is a 502)
export async function upstreamError(label: string, response: Response, status?: ContentfulStatusCode): Promise<HTTPException> {
	const text = await response.text().catch(() => "");
	status ??= response.status === 404 ? 404 : response.status === 429 ? 429 : 502;
	return new HTTPException(status, { message: `${label} -> ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}` });
}
