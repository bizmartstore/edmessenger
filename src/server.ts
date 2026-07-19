import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const SUPABASE_URL = "https://ijxoffbsedvcqbqeohju.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_efDdsdHfnNGJVgvyxAlCKw_eZRxjE2p";

/** Ping Supabase so free-tier projects stay awake; also answers Cloudflare cron. */
async function handleKeepAlive(): Promise<Response> {
  const started = Date.now();
  let supabaseOk = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Prefer: "count=exact",
      },
    });
    supabaseOk = res.ok || res.status === 200 || res.status === 206;
  } catch {
    supabaseOk = false;
  }
  return new Response(
    JSON.stringify({
      ok: true,
      worker: "alive",
      supabase: supabaseOk,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/keepalive" || url.pathname === "/cdn-cgi/keepalive") {
        return handleKeepAlive();
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },

  /** Cloudflare Cron Trigger — keeps Worker + Supabase warm */
  async scheduled(_controller: unknown, _env: unknown, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(handleKeepAlive());
  },
};
