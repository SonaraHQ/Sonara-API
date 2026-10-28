import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "@/config/env.js";
import type { Context } from "hono";

function socketAddress(c: Context): string | undefined {
	try {
		return getConnInfo(c).remote.address;
	} catch {
		// No Node socket, e.g. requests made with app.request() in tests
		return undefined;
	}
}

// Proxy headers are only trusted with TRUST_PROXY, anyone can send them otherwise
export function clientIp(c: Context): string {
	const forwarded = config.trustProxy ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") : undefined;
	let ip = forwarded || socketAddress(c) || "unknown";

	if (ip === "::1") ip = "127.0.0.1";
	if (ip.startsWith("::ffff:")) ip = ip.slice(7);

	return ip;
}
