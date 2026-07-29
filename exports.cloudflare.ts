/**
 * Nitro Cloudflare additional exports — must NOT have a default export.
 * These named exports are merged into `.output/server/index.mjs` so Wrangler
 * can resolve Durable Object class bindings.
 */
export { GotchiTowerRoom } from "./src/workers/gotchi-tower-room";
