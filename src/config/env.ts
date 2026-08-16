import "dotenv/config";

const tokenEndpoint = process.env.TOKEN_ENDPOINT?.trim() || "";

if (!tokenEndpoint) throw new Error("Missing TOKEN_ENDPOINT environment variable; check your .env file.");

export const config = {
	tokenEndpoint
};