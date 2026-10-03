import { SpotifyTokenHandler } from "@/token/handler.js";

// Single shared instance: used by the /spotifytoken routes and by the resolver services
export const tokenHandler = new SpotifyTokenHandler();
