import type { SpotifyToken, SpotifyClientToken, ClientTokenResponse } from "@/types/token.js";
import type { Browser, BrowserContext, LaunchOptions, Page, Response } from "playwright";
import { mobileUserAgent, setChromeVersion } from "@/utils/user-agent.js";
import { Semaphore } from "@/utils/semaphore.js";
import { logs } from "@/utils/logger.js";
import { config } from "@/config/env.js";
import { chromium } from "playwright";

const CAPTURE_TIMEOUT_MS = 15_000;

type Cookies = Parameters<BrowserContext["addCookies"]>[0];
type Matcher = (response: Response) => boolean;

const isAccessToken: Matcher = (response) => response.url().includes("/api/token");
const isClientToken: Matcher = (response) => response.url().includes("clienttoken.spotify.com/v1/clienttoken");

const BLOCKED_TYPES = new Set(["image", "stylesheet", "font", "media", "websocket", "other"]);
const BLOCKED_PATTERNS = ["google-analytics", "doubleclick.net", "googletagmanager.com", "https://open.spotifycdn.com/cdn/images/", "https://encore.scdn.co/fonts/"];

const LAUNCH_OPTIONS: LaunchOptions = {
	headless: true,
	args: [
		"--disable-gpu",
		"--disable-dev-shm-usage",
		"--disable-setuid-sandbox",
		"--no-sandbox",
		"--no-zygote",
		"--disable-extensions",
		"--disable-background-timer-throttling",
		"--disable-blink-features=AutomationControlled",
		"--disable-backgrounding-occluded-windows",
		"--disable-renderer-backgrounding",
		// Minimal window size to save RAM
		"--window-size=1,1",
	],
};

export class SpotifyBrowser {
	private lock = new Semaphore();

	private async setupPage(page: Page): Promise<void> {
		await page.route("**/*", (route) => {
			const request = route.request();
			const url = request.url();

			if (BLOCKED_TYPES.has(request.resourceType()) || BLOCKED_PATTERNS.some((pattern) => url.includes(pattern))) return route.abort();
			return route.continue();
		});
	}

	// Launches a short-lived Chromium (no idle memory between refreshes), loads open.spotify.com
	// and returns the JSON of the first response matching each matcher, in the same order
	private async capture(label: string, matchers: Matcher[], cookies: Cookies = []): Promise<unknown[]> {
		const release = await this.lock.acquire();
		let browser: Browser | undefined;

		try {
			browser = await chromium.launch(config.browserPath ? { ...LAUNCH_OPTIONS, executablePath: config.browserPath } : LAUNCH_OPTIONS);
			setChromeVersion(browser.version());
			const context = await browser.newContext({ userAgent: mobileUserAgent(), viewport: { width: 1, height: 1 } });
			if (cookies.length) await context.addCookies(cookies);
			const page = await context.newPage();
			await this.setupPage(page);

			// Listen before navigating so a fast response cannot be missed
			const captured = matchers.map((match) => page.waitForResponse((r) => r.status() === 200 && match(r), { timeout: CAPTURE_TIMEOUT_MS }));
			// Avoid unhandled rejections if goto() fails first
			for (const promise of captured) promise.catch(() => {});
			await page.goto("https://open.spotify.com/", { waitUntil: "domcontentloaded" });

			return await Promise.all(captured.map(async (response) => (await response).json()));
		} catch (error) {
			logs("error", `Failed to fetch ${label}: ${error}`);
			throw error;
		} finally {
			if (browser) await browser.close().catch(() => {});
			release();
		}
	}

	// One page load yields both anonymous tokens
	public async fetchAnonymousTokens(): Promise<{ access: SpotifyToken; client: SpotifyClientToken }> {
		const [access, client] = await this.capture("anonymous tokens", [isAccessToken, isClientToken]);
		return { access: toAccessToken(access as SpotifyToken), client: toClientToken(client as ClientTokenResponse) };
	}

	// Logs the web player in with the account's sp_dc cookie, so the token can read lyrics
	public async fetchAccountToken(spDc: string): Promise<SpotifyToken> {
		const [json] = await this.capture(
			"account token",
			[isAccessToken],
			[{ name: "sp_dc", value: spDc, domain: ".spotify.com", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }],
		);
		const token = toAccessToken(json as SpotifyToken);
		if (token.isAnonymous !== false) throw new Error("Spotify returned an anonymous token: SPOTIFY_SP_DC is missing, invalid or expired");
		return token;
	}

	public async close(): Promise<void> {
		// Nothing to close as we don't keep persistent state
	}
}

function toAccessToken(json: SpotifyToken): SpotifyToken {
	delete json._notes;
	return json;
}

function toClientToken(json: ClientTokenResponse): SpotifyClientToken {
	if (!json?.granted_token) throw new Error("Missing granted_token in client token response");

	const granted = json.granted_token;
	const now = Date.now();

	return {
		raw: json,
		accessToken: granted.token,
		accessTokenExpirationTimestampMs: now + Number(granted.expires_after_seconds) * 1000,
		refreshAfterTimestampMs: granted.refresh_after_seconds ? now + Number(granted.refresh_after_seconds) * 1000 : undefined,
	};
}
