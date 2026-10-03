import type { SpotifyToken, SpotifyClientToken, ClientTokenResponse } from "@/types/token.js";
import type { Browser, LaunchOptions, Page, Response } from "playwright";
import { Semaphore } from "@/utils/semaphore.js";
import { logs } from "@/utils/logger.js";
import { config } from "@/config/env.js";
import { chromium } from "playwright";

const USER_AGENT = "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const CAPTURE_TIMEOUT_MS = 15_000;

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
	};

	// Launches a short-lived Chromium (no idle memory between refreshes), loads
	// open.spotify.com and returns the JSON of the first response matching `match`
	private async capture<T>(label: string, match: (response: Response) => boolean): Promise<T> {
		const release = await this.lock.acquire();
		let browser: Browser | undefined;

		try {
			browser = await chromium.launch(config.browserPath ? { ...LAUNCH_OPTIONS, executablePath: config.browserPath } : LAUNCH_OPTIONS);
			const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1, height: 1 } });
			const page = await context.newPage();
			await this.setupPage(page);

			// Listen before navigating so a fast response cannot be missed
			const captured = page.waitForResponse((r) => r.status() === 200 && match(r), { timeout: CAPTURE_TIMEOUT_MS });
			captured.catch(() => {}); // avoid an unhandled rejection if goto() fails first
			await page.goto("https://open.spotify.com/", { waitUntil: "domcontentloaded" });

			return (await (await captured).json()) as T;
		} catch (error) {
			logs("error", `Failed to fetch ${label}: ${error}`);
			throw error;
		} finally {
			if (browser) await browser.close().catch(() => {});
			release();
		};
	};

	public async fetchToken(): Promise<SpotifyToken> {
		const json = await this.capture<SpotifyToken>("token", (r) => r.url().includes("/api/token"));
		delete json._notes;
		return json;
	};

	public async fetchClientToken(): Promise<SpotifyClientToken> {
		const json = await this.capture<ClientTokenResponse>("client token", (r) => r.url().includes("clienttoken.spotify.com/v1/clienttoken"));
		if (!json?.granted_token) throw new Error("Missing granted_token in client token response");

		const granted = json.granted_token;
		const now = Date.now();

		return {
			raw: json,
			accessToken: granted.token,
			accessTokenExpirationTimestampMs: now + Number(granted.expires_after_seconds) * 1000,
			refreshAfterTimestampMs: granted.refresh_after_seconds ? now + Number(granted.refresh_after_seconds) * 1000 : undefined,
		};
	};

	public async close(): Promise<void> {
		// Nothing to close as we don't keep persistent state
	};
};
