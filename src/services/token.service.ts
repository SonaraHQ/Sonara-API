import { config } from "../config/env.js";
import { LRUCache } from "lru-cache";

interface TokenResponse { clientId: string; accessToken: string; accessTokenExpirationTimestampMs: number; isAnonymous: boolean };

const AccessTokenCache = new LRUCache<string, string>({
	max: 1,
});
const WebApiTokenCache = new LRUCache<string, string>({
 	max: 100
});

export async function getAccessToken(): Promise<string> {
	try {
		const cached = AccessTokenCache.get("token");
		if (cached) return cached;

		const response = await fetch(config.tokenEndpoint as string);
		if (!response.ok) throw new Error(`Failed to fetch token -> ${response.statusText}`);

		const data: TokenResponse = await response.json();

		const ttl = data.accessTokenExpirationTimestampMs - Date.now() - 10_000;
		if (ttl > 0) AccessTokenCache.set("token", data.accessToken, { ttl });

		return data.accessToken;
	} catch (error) {
		throw new Error(`Error fetching Spotify token -> ${error}`);
	};
};

export async function getWebApiToken(clientId?: string, clientSecret?: string): Promise<string> {
	try {
		if (!clientId || !clientSecret) throw new Error("Missing client_id and client_secret in request; per-request credentials are required.");

		const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

		const cached = WebApiTokenCache.get(auth);
		if (cached) return cached;

		const response = await fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
			}).toString(),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Failed to fetch Spotify Web API token -> ${response.status} ${response.statusText} - ${text}.`);
		};

		const data = await response.json();
		const token = data.access_token;

		const ttl = data.expires_in * 1_000 - 10_000;
		if (ttl > 0) WebApiTokenCache.set(auth, token, { ttl });

		return token;
	} catch (error) {
		throw new Error(`Error fetching Spotify Web API token -> ${error}.`);
	};
};

export function invalidateAccessTokenCache() {
	AccessTokenCache.delete("token");
};