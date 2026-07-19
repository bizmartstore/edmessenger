import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type EnvBag = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  ONESIGNAL_REST_API_KEY?: string;
  ONESIGNAL_APP_ID?: string;
};

type CloudflareGlobal = typeof globalThis & { __env__?: EnvBag };

/**
 * Nitro's Cloudflare preset sets globalThis.__env__, then calls the SSR
 * entry as `fetch(request)` only — so the `env` arg is often undefined.
 * Always merge both so Worker bindings remain visible.
 */
function resolveEnv(env: unknown): EnvBag {
  const arg = env && typeof env === "object" ? (env as EnvBag) : {};
  const fromNitro = (globalThis as CloudflareGlobal).__env__;
  return {
    ...fromNitro,
    ...arg,
  };
}

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
function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return headers;
}

function resolveRestKey(envBag: EnvBag): string {
  const fromEnv = envBag.ONESIGNAL_REST_API_KEY?.trim();
  return fromEnv || "";
}

function resolveAppId(envBag: EnvBag): string {
  const fromEnv = envBag.ONESIGNAL_APP_ID?.trim();
  return fromEnv || ONESIGNAL_APP_ID;
}

function absoluteUrl(origin: string, url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, origin).toString();
  } catch {
    return undefined;
  }
}

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type PushAudience =
  | { type: "external_ids"; externalIds: string[] }
  | { type: "role"; role: "admin" | "student" }
  | { type: "all_except"; excludeIds: string[] };

type PushBody = {
  title?: string;
  body?: string;
  url?: string;
  audience?: PushAudience;
};

async function verifySupabaseUser(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchProfileIds(token: string): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to load profiles (${res.status})`);
  }
  const rows = (await res.json()) as Array<{ id?: string }>;
  return rows.map((r) => r.id).filter((id): id is string => Boolean(id));
}


async function fetchRoleUserIds(token: string, role: "admin" | "student"): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?select=user_id&role=eq.${role}`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to load roles (${res.status})`);
  }
  const rows = (await res.json()) as Array<{ user_id?: string }>;
  return [...new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
}

async function sendOneSignal(
  restKey: string,
  appId: string,
  base: Record<string, unknown>,
  targeting: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Key ${restKey}`,
    },
    body: JSON.stringify({ ...base, ...targeting }),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }
  if (!res.ok) {
    console.error("OneSignal error", res.status, parsed);
    throw new Error(typeof parsed === "object" && parsed && "errors" in (parsed as object)
      ? JSON.stringify((parsed as { errors?: unknown }).errors)
      : `OneSignal HTTP ${res.status}`);
  }
  return parsed;
}

async function handlePushNotify(request: Request, envBag: EnvBag): Promise<Response> {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, cors);
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !(await verifySupabaseUser(token))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401, cors);
  }

  let payload: PushBody;
  try {
    payload = (await request.json()) as PushBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400, cors);
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const audience = payload.audience;
  if (!title || !body || !audience?.type) {
    return jsonResponse({ ok: false, error: "title, body, and audience required" }, 400, cors);
  }

  const restKey = resolveRestKey(envBag);
  if (!restKey) {
    return jsonResponse({ ok: false, error: "ONESIGNAL_REST_API_KEY not configured" }, 503, cors);
  }
  const appId = resolveAppId(envBag);
  const abs = absoluteUrl(new URL(request.url).origin, payload.url);
  const base: Record<string, unknown> = {
    app_id: appId,
    target_channel: "push",
    headings: { en: title },
    contents: { en: body },
  };
  if (abs) {
    base.url = abs;
    base.web_url = abs;
    base.app_url = abs;
  }

  base.collapse_id = `edm-${audience.type}-${title}`.replace(/\s+/g, "-").slice(0, 64);
  base.web_push_topic = String(base.collapse_id);

  try {
    if (audience.type === "role") {
      if (audience.role !== "admin" && audience.role !== "student") {
        return jsonResponse({ ok: false, error: "Invalid role" }, 400, cors);
      }
      const ids = await fetchRoleUserIds(token, audience.role);
      if (!ids.length) {
        return jsonResponse({ ok: true, recipients: 0 }, 200, cors);
      }
      const batches = chunkIds(ids, 2000);
      const results: unknown[] = [];
      for (const batch of batches) {
        results.push(
          await sendOneSignal(restKey, appId, base, {
            include_aliases: { external_id: batch },
          }),
        );
      }
      return jsonResponse(
        { ok: true, onesignal: results.length === 1 ? results[0] : results },
        200,
        cors,
      );
    }

    let externalIds: string[] = [];
    if (audience.type === "external_ids") {
      externalIds = [...new Set((audience.externalIds ?? []).filter(Boolean))];
    } else if (audience.type === "all_except") {
      const exclude = new Set((audience.excludeIds ?? []).filter(Boolean));
      const all = await fetchProfileIds(token);
      externalIds = all.filter((id) => !exclude.has(id));
      if (!externalIds.length) {
        return jsonResponse({ ok: true, recipients: 0 }, 200, cors);
      }
    } else {
      return jsonResponse({ ok: false, error: "Unknown audience type" }, 400, cors);
    }

    if (!externalIds.length) {
      return jsonResponse({ ok: true, recipients: 0 }, 200, cors);
    }

    const batches = chunkIds(externalIds, 2000);
    const results: unknown[] = [];
    for (const batch of batches) {
      const onesignal = await sendOneSignal(restKey, appId, base, {
        include_aliases: { external_id: batch },
      });
      results.push(onesignal);
    }
    return jsonResponse(
      { ok: true, onesignal: results.length === 1 ? results[0] : results },
      200,
      cors,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OneSignal failed";
    console.error("push notify failed", err);
    return jsonResponse({ ok: false, error: message }, 502, cors);
  }
}

function handlePushHealth(envBag: EnvBag): Response {
  const restKey = resolveRestKey(envBag);
  return jsonResponse({ ok: true, configured: Boolean(restKey) });
}

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
      const envBag = resolveEnv(env);

      if (url.pathname === "/api/keepalive" || url.pathname === "/cdn-cgi/keepalive") {
        return handleKeepAlive();
      }

      if (url.pathname === "/api/push/health") {
        return handlePushHealth(envBag);
      }

      if (url.pathname === "/api/push/notify") {
        return handlePushNotify(request, envBag);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env ?? envBag, ctx);
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
