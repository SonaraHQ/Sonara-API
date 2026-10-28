import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";
import { clientIp } from "@/utils/ip.js";
import { LRUCache } from "lru-cache";

const WINDOW_MS = 60_000;

// Fixed one-minute window per client IP
export function rateLimit(perMinute: number): MiddlewareHandler {
	// Bounded so a flood of distinct IPs cannot grow memory forever
	const windows = new LRUCache<string, { count: number; resetAt: number }>({ max: 10_000 });

	return async (c, next) => {
		const ip = clientIp(c);
		const now = Date.now();

		let window = windows.get(ip);
		if (!window || window.resetAt <= now) {
			window = { count: 0, resetAt: now + WINDOW_MS };
			windows.set(ip, window);
		}
		window.count++;

		c.header("X-RateLimit-Limit", String(perMinute));
		c.header("X-RateLimit-Remaining", String(Math.max(perMinute - window.count, 0)));

		if (window.count > perMinute) {
			c.header("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
			throw new HTTPException(429, { message: "Too many requests" });
		}
		await next();
	};
}
