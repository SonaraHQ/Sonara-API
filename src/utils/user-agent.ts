// Major version of the bundled Chromium, updated on every launch so the advertised browser never goes stale.
// The fallback only covers requests made before the first launch
let chromeMajor = "156";

export function setChromeVersion(version: string): void {
	chromeMajor = version.split(".")[0] || chromeMajor;
}

// Reduced user agents, the format current Chrome versions send
export function mobileUserAgent(): string {
	return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Mobile Safari/537.36`;
}

export function desktopUserAgent(): string {
	return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}
