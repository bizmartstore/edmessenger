import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const phaserSsrStub = path.resolve(rootDir, "src/lib/phaser-ssr-stub.ts");

/** Replace Phaser with a tiny stub during SSR/Nitro so Workers do not ship the canvas engine. */
function phaserSsrStubPlugin(): Plugin {
  return {
    name: "phaser-ssr-stub",
    enforce: "pre",
    resolveId(id, _importer, opts) {
      if (id !== "phaser") return null;
      const env = this.environment;
      const name = env?.name ?? "";
      const isServer =
        opts?.ssr === true ||
        env?.config?.consumer === "server" ||
        name === "ssr" ||
        name === "nitro" ||
        name.includes("server");
      return isServer ? phaserSsrStub : null;
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [phaserSsrStubPlugin()],
  },
  nitro: {
    // Merge Durable Object named exports into the Worker entry (Nitro 3).
    cloudflare: {
      exports: "./exports.cloudflare.ts",
    } as { exports: string },
  },
});
