import { tokenHandler } from "@/token/index.js";
import { LRUCache } from "lru-cache";

const WebApiTokenCache = new LRUCache<string, string>({ max: 100 });
const pendingWebApiTokens = new Map<string, Promise<string>>();

export async function getAccessToken(): Promise<string> {
	try {
		const token = await tokenHandler.getToken();
		return token.accessToken;
	} catch (error) {
		throw new Error(`Error fetching Spotify token -> ${error}`);
	}
}

async function requestWebApiToken(auth: string): Promise<string> {
	const response = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${auth}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to fetch Spotify Web API token -> ${response.status} ${response.statusText} - ${text}.`);
	}

	const data = (await response.json()) as { access_token: string; expires_in: number };

	const ttl = data.expires_in * 1_000 - 10_000;
	if (ttl > 0) WebApiTokenCache.set(auth, data.access_token, { ttl });

	return data.access_token;
}

export async function getWebApiToken(clientId?: string, clientSecret?: string): Promise<string> {
	if (!clientId || !clientSecret) throw new Error("Missing client_id and client_secret in request; per-request credentials are required.");

	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

	const cached = WebApiTokenCache.get(auth);
	if (cached) return cached;

	// Concurrent requests with the same credentials share one token request
	let pending = pendingWebApiTokens.get(auth);
	if (!pending) {
		pending = requestWebApiToken(auth).finally(() => pendingWebApiTokens.delete(auth));
		pendingWebApiTokens.set(auth, pending);
	}

	try {
		return await pending;
	} catch (error) {
		throw new Error(`Error fetching Spotify Web API token -> ${error}.`);
	}
}

export function invalidateAccessTokenCache() {
	tokenHandler.invalidate();
}
