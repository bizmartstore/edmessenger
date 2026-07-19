import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type EnvBag = {
  ONESIGNAL_REST_API_KEY?: string;
  ONESIGNAL_APP_ID?: string;
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
const ONESIGNAL_APP_ID = "718bec75-70f7-4936-bdff-5dd26e8c835d";

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

type NotifyBody = {
  title?: string;
  message?: string;
  url?: string;
  origin?: string;
  audience?: "students" | "admins" | "users" | "all";
  userIds?: string[];
  excludeUserIds?: string[];
};

async function handleNotify(request: Request, env: EnvBag): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const restKey = (env.ONESIGNAL_REST_API_KEY ?? "").trim();
  if (!restKey) {
    console.error("[notify] ONESIGNAL_REST_API_KEY is not set — pushes are skipped");
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: true,
        reason: "Set ONESIGNAL_REST_API_KEY as a Cloudflare Worker secret to send pushes.",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }

  const title = (body.title ?? "EdMessenger").slice(0, 80);
  const message = (body.message ?? "").slice(0, 160);
  const reqOrigin = body.origin || new URL(request.url).origin;
  let launchUrl = body.url ?? `${reqOrigin}/`;
  if (launchUrl.startsWith("/")) launchUrl = `${reqOrigin}${launchUrl}`;
  const iconUrl = `${reqOrigin}/logo-pwa.png`;
  const appId = env.ONESIGNAL_APP_ID ?? ONESIGNAL_APP_ID;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    app_id: appId,
    headings: { en: title },
    contents: { en: message || title },
    url: launchUrl,
    web_url: launchUrl,
    target_channel: "push",
    chrome_web_icon: iconUrl,
    firefox_icon: iconUrl,
    chrome_web_badge: iconUrl,
  };

  if (body.audience === "users" && body.userIds?.length) {
    const ids = body.userIds.filter((id) => !body.excludeUserIds?.includes(id));
    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no recipients after exclude" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    payload.include_aliases = { external_id: ids };
  } else if (body.audience === "admins") {
    payload.filters = [{ field: "tag", key: "role", relation: "=", value: "admin" }];
  } else if (body.audience === "all") {
    // Students OR admins (classroom chat, etc.)
    payload.filters = [
      { field: "tag", key: "role", relation: "=", value: "student" },
      { operator: "OR" },
      { field: "tag", key: "role", relation: "=", value: "admin" },
    ];
  } else {
    // Default: students (announcements, quizzes, activities, lessons)
    payload.filters = [{ field: "tag", key: "role", relation: "=", value: "student" }];
  }

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      Authorization: `Key ${restKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[notify] OneSignal error", res.status, text.slice(0, 500));
  }
  return new Response(text, {
    status: res.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Always serve valid JS — never let SSR/HTML fallback claim this path. */
function handleOneSignalServiceWorker(): Response {
  return new Response(
    'importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");\n',
    {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "service-worker-allowed": "/",
        "cache-control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      const envBag = (env ?? {}) as EnvBag;

      // Must be before SSR — a HTML body here breaks push (empty token / no active SW).
      if (url.pathname === "/OneSignalSDKWorker.js") {
        return handleOneSignalServiceWorker();
      }
      if (url.pathname === "/api/keepalive" || url.pathname === "/cdn-cgi/keepalive") {
        return handleKeepAlive();
      }
      if (url.pathname === "/api/notify") {
        return handleNotify(request, envBag);
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

  async scheduled(_controller: unknown, _env: unknown, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(handleKeepAlive());
  },
};
