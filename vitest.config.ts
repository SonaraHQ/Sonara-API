import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { tmpdir } from "node:os";
import path from "node:path";

export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		include: ["test/**/*.test.ts"],
		// Keeps the disk cache of the tests away from the real one
		env: { CACHE_DIR: path.join(tmpdir(), `sonara-api-test-${process.pid}`) },
	},
});
