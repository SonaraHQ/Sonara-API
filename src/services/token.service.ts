import { fetchWithRetry, upstreamError } from "@/utils/http.js";
import { HTTPException } from "hono/http-exception";
import { tokenHandler } from "@/token/index.js";
import { LRUCache } from "lru-cache";

const WebApiTokenCache = new LRUCache<string, string>({ max: 100 });
const pendingWebApiTokens = new Map<string, Promise<string>>();

export async function getAccessToken(): Promise<string> {
	return (await tokenHandler.getToken()).accessToken;
}

async function requestWebApiToken(auth: string): Promise<string> {
	const response = await fetchWithRetry("Spotify Web API token", "https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${auth}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
	});

	// 400/401 here means the client_id/client_secret sent by the caller are wrong
	if (response.status === 400 || response.status === 401) throw await upstreamError("Invalid client_id or client_secret", response, 401);
	if (!response.ok) throw await upstreamError("Spotify Web API token", response);

	const data = (await response.json()) as { access_token: string; expires_in: number };

	const ttl = data.expires_in * 1_000 - 10_000;
	if (ttl > 0) WebApiTokenCache.set(auth, data.access_token, { ttl });

	return data.access_token;
}

export async function getWebApiToken(clientId?: string, clientSecret?: string): Promise<string> {
	if (!clientId || !clientSecret) throw new HTTPException(400, { message: "Missing client_id and client_secret in request; per-request credentials are required." });

	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

	const cached = WebApiTokenCache.get(auth);
	if (cached) return cached;

	// Concurrent requests with the same credentials share one token request
	let pending = pendingWebApiTokens.get(auth);
	if (!pending) {
		pending = requestWebApiToken(auth).finally(() => pendingWebApiTokens.delete(auth));
		pendingWebApiTokens.set(auth, pending);
	}

	return pending;
}

export function invalidateAccessTokenCache(accessToken: string) {
	tokenHandler.invalidate(accessToken);
}
