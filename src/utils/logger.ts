const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const GRAY = "\x1b[90m";

export function logs(level: "log" | "error" | "warn" | "info", ...args: unknown[]): void {
	const timestamp = `[${new Date().toUTCString()}]`;
	let coloredLevel: string;

	if (level === "error") {
		coloredLevel = `${RED}${BOLD}[ERROR]${RESET}`;
	} else if (level === "warn") {
		coloredLevel = `${YELLOW}${BOLD}[WARN]${RESET}`;
	} else if (level === "info") {
		coloredLevel = `${BLUE}${BOLD}[INFO]${RESET}`;
	} else {
		coloredLevel = `${GREEN}${BOLD}[LOG]${RESET}`;
	};
	
	// Print with colorized level and timestamp
	(console[level] as (...args: unknown[]) => void)(
		`${coloredLevel} ${GRAY}${timestamp}${RESET}`,
		...args,
	);
};
