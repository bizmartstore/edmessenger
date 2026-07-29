/**
 * Ensures GotchiTowerRoom is defined as a top-level named export inside
 * `.output/server/index.mjs`. Cloudflare rejects DO migrations when the class
 * only lives in a chunk or is missing from the Worker entry [code: 10070].
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");
const indexPath = path.join(projectRoot, ".output", "server", "index.mjs");
const doSrcPath = path.join(projectRoot, "src", "workers", "gotchi-tower-room.ts");

function hasNamedExport(source, name) {
  if (new RegExp(`export\\s+(?:async\\s+)?class\\s+${name}\\b`).test(source)) return true;
  if (new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)) return true;
  return false;
}

async function main() {
  if (!fs.existsSync(indexPath)) {
    console.warn("[ensure-do-export] Missing .output/server/index.mjs — skip");
    return;
  }

  let source = fs.readFileSync(indexPath, "utf8");
  if (hasNamedExport(source, "GotchiTowerRoom")) {
    console.log("[ensure-do-export] GotchiTowerRoom already exported from entry");
    return;
  }

  const bundled = await esbuild.build({
    entryPoints: [doSrcPath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    logLevel: "warning",
  });

  const doCode = bundled.outputFiles?.[0]?.text ?? "";
  if (!doCode.includes("GotchiTowerRoom")) {
    throw new Error("[ensure-do-export] Bundle did not contain GotchiTowerRoom");
  }

  const marker = "/* gotchi-tower-do-inline */";
  if (source.includes(marker)) {
    console.log("[ensure-do-export] inline marker already present");
    return;
  }

  fs.appendFileSync(
    indexPath,
    `\n${marker}\n${doCode}\n`,
  );
  console.log("[ensure-do-export] Inlined GotchiTowerRoom into Worker entry");
}

main().catch((err) => {
  console.error("[ensure-do-export] failed", err);
  process.exit(1);
});
