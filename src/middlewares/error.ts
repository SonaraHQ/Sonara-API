import { HTTPException } from "hono/http-exception";
import type { ErrorHandler } from "hono";
import { logs } from "@/utils/logger.js";

// Errors are always answered as `{ error }` JSON, keeping the status of expected failures
export const onError: ErrorHandler = (err, c) => {
	if (err instanceof HTTPException) {
		logs(err.status >= 500 ? "error" : "warn", `${c.req.method} ${c.req.path} -> ${err.status} ${err.message}`);
		return c.json({ error: err.message }, err.status);
	}
	logs("error", err.message);
	return c.json({ error: err.message }, 500);
};
