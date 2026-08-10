import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { GotchiTowerRoom } from "./workers/gotchi-tower-room";

export { GotchiTowerRoom };

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type EnvBag = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  ONESIGNAL_REST_API_KEY?: string;
  ONESIGNAL_APP_ID?: string;
  GEMINI_API_KEY?: string;
  GOTCHI_TOWER?: DurableObjectNamespace;
};

type CloudflareGlobal = typeof globalThis & {
  __env__?: EnvBag;
  process?: { env?: Record<string, string | undefined> };
};

type RequestWithCf = Request & {
  runtime?: { cloudflare?: { env?: EnvBag } };
};

/**
 * Read a binding by direct property access.
 * Do NOT Object-spread Cloudflare `env` — secrets are often non-enumerable
 * on the Workers Env object, so `{ ...env }` silently drops ONESIGNAL_REST_API_KEY.
 */
function readStringBinding(source: unknown, key: keyof EnvBag): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  try {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function nitroEnv(): EnvBag | undefined {
  return (globalThis as CloudflareGlobal).__env__;
}

function requestEnv(request?: Request): EnvBag | undefined {
  if (!request) return undefined;
  return (request as RequestWithCf).runtime?.cloudflare?.env;
}

/**
 * Nitro's Cloudflare preset sets globalThis.__env__, then calls the SSR
 * entry as `fetch(request)` only — so the `env` arg is often undefined.
 * Prefer fetch `env`, then request.runtime.cloudflare.env, then Nitro global, then process.env.
 */
function resolveEnv(env: unknown, request?: Request): EnvBag {
  const fromArg = env && typeof env === "object" ? (env as EnvBag) : undefined;
  const fromReq = requestEnv(request);
  const fromNitro = nitroEnv();
  const fromProcess = (globalThis as CloudflareGlobal).process?.env;
  return {
    ASSETS: fromArg?.ASSETS ?? fromReq?.ASSETS ?? fromNitro?.ASSETS,
    ONESIGNAL_REST_API_KEY:
      readStringBinding(fromArg, "ONESIGNAL_REST_API_KEY") ||
      readStringBinding(fromReq, "ONESIGNAL_REST_API_KEY") ||
      readStringBinding(fromNitro, "ONESIGNAL_REST_API_KEY") ||
      fromProcess?.ONESIGNAL_REST_API_KEY,
    ONESIGNAL_APP_ID:
      readStringBinding(fromArg, "ONESIGNAL_APP_ID") ||
      readStringBinding(fromReq, "ONESIGNAL_APP_ID") ||
      readStringBinding(fromNitro, "ONESIGNAL_APP_ID") ||
      fromProcess?.ONESIGNAL_APP_ID,
    GEMINI_API_KEY:
      readStringBinding(fromArg, "GEMINI_API_KEY") ||
      readStringBinding(fromReq, "GEMINI_API_KEY") ||
      readStringBinding(fromNitro, "GEMINI_API_KEY") ||
      fromProcess?.GEMINI_API_KEY,
    GOTCHI_TOWER:
      (fromArg?.GOTCHI_TOWER as DurableObjectNamespace | undefined) ??
      (fromReq?.GOTCHI_TOWER as DurableObjectNamespace | undefined) ??
      (fromNitro?.GOTCHI_TOWER as DurableObjectNamespace | undefined),
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
  return envBag.ONESIGNAL_REST_API_KEY?.trim() || "";
}

function resolveAppId(envBag: EnvBag): string {
  return envBag.ONESIGNAL_APP_ID?.trim() || ONESIGNAL_APP_ID;
}

/** Safe diagnostics for /api/push/health — never returns secret values. */
function pushConfigDiagnostics(envArg: unknown, envBag: EnvBag, request?: Request) {
  const fromArg = readStringBinding(envArg, "ONESIGNAL_REST_API_KEY");
  const fromReq = readStringBinding(requestEnv(request), "ONESIGNAL_REST_API_KEY");
  const fromNitro = readStringBinding(nitroEnv(), "ONESIGNAL_REST_API_KEY");
  const fromProcess = (globalThis as CloudflareGlobal).process?.env?.ONESIGNAL_REST_API_KEY;
  const key = resolveRestKey(envBag);
  let enumerableKeys: string[] = [];
  try {
    const src = (envArg && typeof envArg === "object" ? envArg : null) || requestEnv(request) || nitroEnv();
    if (src && typeof src === "object") enumerableKeys = Object.keys(src as object);
  } catch {
    enumerableKeys = [];
  }
  return {
    configured: Boolean(key),
    keyLength: key.length,
    sources: {
      envArg: Boolean(fromArg?.trim()),
      requestRuntime: Boolean(fromReq?.trim()),
      nitroGlobal: Boolean(fromNitro?.trim()),
      processEnv: Boolean(fromProcess?.trim()),
    },
    enumerableKeys,
  };
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
  | { type: "role_except"; role: "admin" | "student"; excludeIds: string[] }
  | { type: "all_except"; excludeIds: string[] };

type PushBody = {
  title?: string;
  body?: string;
  url?: string;
  audience?: PushAudience;
};

const PRIMARY_ADMIN_EMAILS = new Set([
  "sheethappenswithjaa@gmail.com",
  "sheethappenwithjaa@gmail.com",
]);

async function verifySupabaseUser(token: string): Promise<{ id: string; email: string | null } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string; email?: string };
    if (!user?.id) return null;
    return { id: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}

async function verifyAdmin(token: string): Promise<boolean> {
  const user = await verifySupabaseUser(token);
  if (!user) return false;
  if (user.email && PRIMARY_ADMIN_EMAILS.has(user.email.trim().toLowerCase())) return true;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&limit=1`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_user_ids_by_role`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ _role: role }),
  });
  if (!res.ok) {
    // PostgREST returns 404 when the RPC is missing from the schema cache.
    if (res.status === 404) {
      throw new Error(
        "Missing DB function get_user_ids_by_role — run SUPABASE_MIGRATION_PUSH_ROLES.sql in Supabase SQL Editor",
      );
    }
    throw new Error(`Failed to load roles (${res.status})`);
  }
  const rows = (await res.json()) as unknown;
  const ids = Array.isArray(rows) ? rows : [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)))];
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
  const originUrl = new URL(request.url).origin;
  const abs = absoluteUrl(originUrl, payload.url);
  // Full-color crest for the notification tray icon (replaces OneSignal's default white bell).
  // Badge must be white-on-transparent silhouette — full-color images become a solid white square on Android.
  const iconUrl = `${originUrl}/icons/push-icon.png?v=3`;
  const badgeUrl = `${originUrl}/icons/notif-badge.png?v=3`;
  const base: Record<string, unknown> = {
    app_id: appId,
    target_channel: "push",
    headings: { en: title },
    contents: { en: body },
    // Best-effort iOS home-screen badge bump (web Badging API covers installed PWAs).
    ios_badgeType: "Increase",
    ios_badgeCount: 1,
    chrome_web_icon: iconUrl,
    chrome_web_badge: badgeUrl,
    firefox_icon: iconUrl,
    large_icon: iconUrl,
    huawei_large_icon: iconUrl,
  };
  if (abs) {
    // OneSignal rejects `url` when `web_url` / `app_url` are set.
    base.web_url = abs;
    base.app_url = abs;
  }

  const dedupeSeed = `${audience.type}-${title}-${body}`.replace(/\s+/g, "-");
  base.collapse_id = `edm-${dedupeSeed}`.slice(0, 64);
  base.web_push_topic = String(base.collapse_id);

  try {
    let externalIds: string[] = [];
    if (audience.type === "role" || audience.type === "role_except") {
      if (audience.role !== "admin" && audience.role !== "student") {
        return jsonResponse({ ok: false, error: "Invalid role" }, 400, cors);
      }
      const ids = await fetchRoleUserIds(token, audience.role);
      if (audience.type === "role_except") {
        const exclude = new Set((audience.excludeIds ?? []).filter(Boolean));
        externalIds = ids.filter((id) => !exclude.has(id));
      } else {
        externalIds = ids;
      }
    } else if (audience.type === "external_ids") {
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

function handlePushHealth(envArg: unknown, envBag: EnvBag, request?: Request): Response {
  return jsonResponse({ ok: true, ...pushConfigDiagnostics(envArg, envBag, request) });
}

type GenerateReviewerBody = {
  topic?: string;
  notes?: string;
  count?: number;
};

type GeneratedQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

function extractGeminiJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

/** Prefer a top-level JSON object (for structured generators like Escape Room). */
function extractGeminiJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

function normalizeGeneratedQuestions(raw: unknown, count: number): GeneratedQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: GeneratedQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const question = String(o.question ?? "").trim();
    const options = Array.isArray(o.options)
      ? o.options.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
      : [];
    let correct =
      typeof o.correct_index === "number"
        ? o.correct_index
        : typeof o.correctIndex === "number"
          ? o.correctIndex
          : 0;
    if (!Number.isFinite(correct)) correct = 0;
    const explanation = String(o.explanation ?? "").trim();
    if (!question || options.length < 2) continue;
    out.push({
      question,
      options,
      correct_index: Math.max(0, Math.min(Math.floor(correct), options.length - 1)),
      explanation,
    });
    if (out.length >= count) break;
  }
  return out;
}

async function handleGenerateReviewer(request: Request, envBag: EnvBag): Promise<Response> {
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
  if (!token || !(await verifyAdmin(token))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401, cors);
  }

  const apiKey = envBag.GEMINI_API_KEY?.trim() || "";
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: "GEMINI_API_KEY not configured on the server" },
      503,
      cors,
    );
  }

  let payload: GenerateReviewerBody;
  try {
    payload = (await request.json()) as GenerateReviewerBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400, cors);
  }

  const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
  const count = Math.max(1, Math.min(20, Math.floor(Number(payload.count) || 5)));
  if (!topic && !notes) {
    return jsonResponse({ ok: false, error: "topic or notes required" }, 400, cors);
  }

  const prompt = `You are an education assistant. Create ${count} multiple-choice review questions for students practicing a lesson.

Topic: ${topic || "(from notes)"}
Lesson notes / source material:
${notes || "(none — use the topic only)"}

Rules:
- Exactly 4 options per question (A–D style, but return plain option strings)
- One correct answer per question
- Include a short explanation that teaches why the correct answer is right
- Keep language clear for students
- Return ONLY a JSON array (no markdown) with objects shaped like:
  {"question":"...","options":["...","...","...","..."],"correct_index":0,"explanation":"..."}
- correct_index is 0-based`;

  // Prefer models available to new API keys (older Flash IDs are often blocked).
  const models = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ];

  try {
    let lastError = "Gemini request failed";
    for (const model of models) {
      const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        }),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw
      }

      if (!res.ok) {
        const geminiErr =
          typeof parsed === "object" && parsed && "error" in (parsed as object)
            ? (parsed as { error?: { code?: number; message?: string; status?: string } }).error
            : undefined;
        const msg = geminiErr?.message || `Gemini HTTP ${res.status}`;
        lastError = msg;
        // Try next model on quota / retired / missing; fail fast on auth errors
        if (geminiErr?.code === 401 || geminiErr?.code === 403) {
          return jsonResponse({ ok: false, error: friendlyGeminiError(msg) }, 502, cors);
        }
        if (
          res.status === 404 ||
          res.status === 429 ||
          /quota|RESOURCE_EXHAUSTED|not found|NOT_FOUND|no longer available|not supported|deprecated/i.test(
            msg,
          )
        ) {
          continue;
        }
        return jsonResponse({ ok: false, error: friendlyGeminiError(msg) }, 502, cors);
      }

      const candidates =
        typeof parsed === "object" && parsed && "candidates" in (parsed as object)
          ? (parsed as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
          : undefined;
      const rawText = candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
      if (!rawText.trim()) {
        lastError = `Gemini (${model}) returned empty content`;
        continue;
      }

      const questions = normalizeGeneratedQuestions(extractGeminiJson(rawText), count);
      if (!questions.length) {
        lastError = `Could not parse Gemini (${model}) questions`;
        continue;
      }
      return jsonResponse({ ok: true, questions, model }, 200, cors);
    }

    return jsonResponse({ ok: false, error: friendlyGeminiError(lastError) }, 502, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini failed";
    console.error("generate reviewer failed", err);
    return jsonResponse({ ok: false, error: friendlyGeminiError(message) }, 502, cors);
  }
}

function friendlyGeminiError(raw: string): string {
  if (/quota|RESOURCE_EXHAUSTED|exceeded your current quota|rate.?limit/i.test(raw)) {
    return (
      "Gemini free quota exceeded for this API key. Wait a minute and retry, " +
      "check https://aistudio.google.com/rate-limit, enable billing, or create a new API key. " +
      "You can still use Paste details for now."
    );
  }
  // Avoid dumping huge JSON blobs into the toast
  if (raw.length > 280) return `${raw.slice(0, 280)}…`;
  return raw;
}

function handleGeminiHealth(envBag: EnvBag): Response {
  const key = envBag.GEMINI_API_KEY?.trim() || "";
  return jsonResponse({ ok: true, configured: Boolean(key), keyLength: key.length });
}

type GenerateTowerBody = {
  topic?: string;
  notes?: string;
  count?: number;
  difficulty?: string;
  floorCount?: number;
};

type GeneratedTowerQuestion = GeneratedQuestion & {
  hint: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  competency: string;
  estimated_seconds: number;
  floor_min: number;
  floor_max: number;
};

function normalizeTowerQuestions(
  raw: unknown,
  count: number,
  floorCount: number,
): GeneratedTowerQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: GeneratedTowerQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const base = normalizeGeneratedQuestions([item], 1)[0];
    if (!base) continue;
    const diffRaw = String(o.difficulty ?? "medium").toLowerCase();
    const difficulty =
      diffRaw === "easy" || diffRaw === "hard" ? diffRaw : "medium";
    const floorMin = Math.max(1, Math.min(floorCount, Math.floor(Number(o.floor_min) || 1)));
    const floorMax = Math.max(
      floorMin,
      Math.min(floorCount, Math.floor(Number(o.floor_max) || floorCount)),
    );
    out.push({
      ...base,
      hint: String(o.hint ?? "").trim(),
      difficulty,
      category: String(o.category ?? "general").trim() || "general",
      competency: String(o.competency ?? o.learning_competency ?? "").trim(),
      estimated_seconds: Math.max(
        10,
        Math.min(120, Math.floor(Number(o.estimated_seconds) || 30)),
      ),
      floor_min: floorMin,
      floor_max: floorMax,
    });
    if (out.length >= count) break;
  }
  return out;
}

async function handleGenerateTowerQuestions(request: Request, envBag: EnvBag): Promise<Response> {
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
  if (!token || !(await verifyAdmin(token))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401, cors);
  }

  const apiKey = envBag.GEMINI_API_KEY?.trim() || "";
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: "GEMINI_API_KEY not configured on the server" },
      503,
      cors,
    );
  }

  let payload: GenerateTowerBody;
  try {
    payload = (await request.json()) as GenerateTowerBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400, cors);
  }

  const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
  const count = Math.max(1, Math.min(30, Math.floor(Number(payload.count) || 10)));
  const floorCount = Math.max(5, Math.min(100, Math.floor(Number(payload.floorCount) || 20)));
  const difficulty = String(payload.difficulty ?? "mixed");
  if (!topic && !notes) {
    return jsonResponse({ ok: false, error: "topic or notes required" }, 400, cors);
  }

  const prompt = `You are an education assistant for Gotchi Tower, a quiz-based educational RPG.
Create ${count} multiple-choice questions spanning floors 1–${floorCount}.

Topic: ${topic || "(from notes)"}
Difficulty preference: ${difficulty}
Lesson notes / source material:
${notes || "(none — use the topic only)"}

Rules:
- Exactly 4 options per question
- One correct answer (correct_index is 0-based)
- Include explanation, hint, difficulty (easy|medium|hard), category, competency, estimated_seconds (15–60)
- Assign floor_min and floor_max so easier questions appear on lower floors and harder on higher floors
- Return ONLY a JSON array (no markdown) shaped like:
  {"question":"...","options":["...","...","...","..."],"correct_index":0,"explanation":"...","hint":"...","difficulty":"medium","category":"...","competency":"...","estimated_seconds":30,"floor_min":1,"floor_max":5}`;

  const models = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ];

  try {
    let lastError = "Gemini request failed";
    for (const model of models) {
      const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.45,
            responseMimeType: "application/json",
          },
        }),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw
      }

      if (!res.ok) {
        const geminiErr =
          typeof parsed === "object" && parsed && "error" in (parsed as object)
            ? (parsed as { error?: { code?: number; message?: string } }).error
            : undefined;
        const msg = geminiErr?.message || `Gemini HTTP ${res.status}`;
        lastError = msg;
        if (geminiErr?.code === 401 || geminiErr?.code === 403) {
          return jsonResponse({ ok: false, error: friendlyGeminiError(msg) }, 502, cors);
        }
        if (
          res.status === 404 ||
          res.status === 429 ||
          /quota|RESOURCE_EXHAUSTED|not found|NOT_FOUND|no longer available|not supported|deprecated/i.test(
            msg,
          )
        ) {
          continue;
        }
        return jsonResponse({ ok: false, error: friendlyGeminiError(msg) }, 502, cors);
      }

      const candidates =
        typeof parsed === "object" && parsed && "candidates" in (parsed as object)
          ? (parsed as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
              .candidates
          : undefined;
      const rawText = candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
      if (!rawText.trim()) {
        lastError = `Gemini (${model}) returned empty content`;
        continue;
      }

      const questions = normalizeTowerQuestions(extractGeminiJson(rawText), count, floorCount);
      if (!questions.length) {
        lastError = `Could not parse Gemini (${model}) questions`;
        continue;
      }
      return jsonResponse({ ok: true, questions, model }, 200, cors);
    }

    return jsonResponse({ ok: false, error: friendlyGeminiError(lastError) }, 502, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini failed";
    console.error("generate tower questions failed", err);
    return jsonResponse({ ok: false, error: friendlyGeminiError(message) }, 502, cors);
  }
}

type GenerateEscapeBody = {
  topic?: string;
  notes?: string;
  template_id?: string;
  template_name?: string;
  puzzle_count?: number;
  minutes?: number;
  difficulty?: string;
};

type GeneratedEscapePuzzle = {
  scene: string;
  title: string;
  story: string;
  question: string;
  answer: string;
  hint: string;
};

const ESCAPE_SCENES_ALLOWED = [
  "library",
  "lab",
  "vault",
  "observatory",
  "spaceship",
  "pyramid",
  "aquarium",
] as const;

function normalizeEscapeConfig(
  raw: unknown,
  puzzleCount: number,
  minutes: number,
): { intro: string; par_seconds: number; puzzles: GeneratedEscapePuzzle[] } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const puzzlesRaw = Array.isArray(obj.puzzles) ? obj.puzzles : [];
  const puzzles: GeneratedEscapePuzzle[] = [];

  for (let i = 0; i < Math.max(puzzleCount, puzzlesRaw.length); i++) {
    if (puzzles.length >= puzzleCount) break;
    const item =
      puzzlesRaw[i] && typeof puzzlesRaw[i] === "object"
        ? (puzzlesRaw[i] as Record<string, unknown>)
        : {};
    const sceneRaw = String(item.scene ?? ESCAPE_SCENES_ALLOWED[i % ESCAPE_SCENES_ALLOWED.length])
      .trim()
      .toLowerCase();
    const scene = (ESCAPE_SCENES_ALLOWED as readonly string[]).includes(sceneRaw)
      ? sceneRaw
      : ESCAPE_SCENES_ALLOWED[i % ESCAPE_SCENES_ALLOWED.length];
    const question = String(item.question ?? "").trim();
    const answer = String(item.answer ?? "").trim();
    if (!question || !answer) continue;
    puzzles.push({
      scene,
      title: String(item.title ?? `Lock ${i + 1}`).trim() || `Lock ${i + 1}`,
      story: String(item.story ?? "").trim(),
      question,
      answer,
      hint: String(item.hint ?? "").trim(),
    });
  }

  const parFromPayload = Math.floor(Number(obj.par_seconds) || 0);
  const par_seconds =
    parFromPayload >= 60
      ? Math.min(3600, parFromPayload)
      : Math.max(60, Math.min(3600, Math.floor(minutes) * 60 || 600));

  return {
    intro:
      String(obj.intro ?? "").trim() ||
      "The door locked behind you. Solve every puzzle to escape before time runs out!",
    par_seconds,
    puzzles,
  };
}

async function handleGenerateEscapeRoom(request: Request, envBag: EnvBag): Promise<Response> {
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
  if (!token || !(await verifyAdmin(token))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401, cors);
  }

  const apiKey = envBag.GEMINI_API_KEY?.trim() || "";
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: "GEMINI_API_KEY not configured on the server" },
      503,
      cors,
    );
  }

  let payload: GenerateEscapeBody;
  try {
    payload = (await request.json()) as GenerateEscapeBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400, cors);
  }

  const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
  const templateName =
    typeof payload.template_name === "string" ? payload.template_name.trim() : "";
  const difficulty = String(payload.difficulty ?? "mixed");
  const puzzleCount = Math.max(3, Math.min(10, Math.floor(Number(payload.puzzle_count) || 5)));
  const minutes = Math.max(5, Math.min(60, Math.floor(Number(payload.minutes) || 15)));
  if (!topic && !notes) {
    return jsonResponse({ ok: false, error: "topic or notes required" }, 400, cors);
  }

  const prompt = `You are an education assistant that builds COMPLETE classroom Escape Room activities for Filipino senior high / college learners.
Create ${puzzleCount} sequential locks/puzzles for an escape room. Every puzzle MUST be tightly aligned to the teacher's topic (including subtopics A/B/C if provided).

${templateName ? `Style inspiration (built-in template name): ${templateName}` : "Create an original educational escape premise."}
Difficulty preference: ${difficulty}
Target escape time: about ${minutes} minutes

Topic / curriculum content:
${topic || "(from notes)"}

Extra teacher notes:
${notes || "(none)"}

Puzzle style mix (vary across locks — not only MCQ):
- Knowledge check (short factual answer)
- Scenario judgment (best interpersonal / values response as a short keyword or phrase)
- Matching-style clue (student types the matched concept)
- Ordering / sequence (student enters the correct sequence as a short answer)
- Cipher / riddle / keyword unlock

Rules:
- scene must be one of: library, lab, vault, observatory, spaceship, pyramid, aquarium
- answer may include alternatives separated by | (e.g. empathy|pakikipagkapwa)
- Use Philippine context when relevant (home, school, community, pakikipagkapwa, Laro ng Lahi, etc.)
- Age-appropriate and educational
- intro: 2-4 sentences immersing students in the escape premise tied to the topic
- par_seconds: ${minutes * 60}
- Return ONLY JSON object (no markdown):
{
  "intro":"...",
  "par_seconds":${minutes * 60},
  "puzzles":[
    {
      "scene":"library",
      "title":"Lock 1 · ...",
      "story":"scene/clue text",
      "question":"what students must answer",
      "answer":"correct|alt",
      "hint":"helpful hint"
    }
  ]
}
Exactly ${puzzleCount} puzzles in the array.`;

  const models = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ];

  try {
    let lastError = "Gemini request failed";
    for (const model of models) {
      const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw
      }

      if (!res.ok) {
        const geminiErr =
          typeof parsed === "object" && parsed && "error" in (parsed as object)
            ? (parsed as { error?: { code?: number; message?: string } }).error
            : undefined;
        const msg = geminiErr?.message || `Gemini HTTP ${res.status}`;
        lastError = msg;
        if (geminiErr?.code === 401 || geminiErr?.code === 403) {
          return jsonResponse({ ok: false, error: friendlyGeminiError(msg) }, 502, cors);
        }
        if (
          res.status === 404 ||
          res.status === 429 ||
          /quota|RESOURCE_EXHAUSTED|not found|NOT_FOUND|no longer available|not supported|deprecated/i.test(
            msg,
          )
        ) {
          continue;
        }
        return jsonResponse({ ok: false, error: friendlyGeminiError(msg) }, 502, cors);
      }

      const candidates =
        typeof parsed === "object" && parsed && "candidates" in (parsed as object)
          ? (parsed as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
              .candidates
          : undefined;
      const rawText = candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
      if (!rawText.trim()) {
        lastError = `Gemini (${model}) returned empty content`;
        continue;
      }

      let extracted: unknown;
      try {
        extracted = extractGeminiJsonObject(rawText);
      } catch {
        lastError = `Could not parse Gemini (${model}) JSON`;
        continue;
      }

      const room = normalizeEscapeConfig(extracted, puzzleCount, minutes);
      if (room.puzzles.length < 3) {
        lastError = `Could not normalize Gemini (${model}) escape room (need ≥3 puzzles)`;
        continue;
      }
      return jsonResponse(
        {
          ok: true,
          intro: room.intro,
          par_seconds: room.par_seconds,
          puzzles: room.puzzles,
          model,
        },
        200,
        cors,
      );
    }

    return jsonResponse({ ok: false, error: friendlyGeminiError(lastError) }, 502, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini failed";
    console.error("generate escape room failed", err);
    return jsonResponse({ ok: false, error: friendlyGeminiError(message) }, 502, cors);
  }
}

async function handleGotchiTowerWs(request: Request, envBag: EnvBag): Promise<Response> {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event")?.trim();
  const token = url.searchParams.get("token")?.trim() || "";

  if (!eventId) {
    return jsonResponse({ ok: false, error: "event required" }, 400);
  }

  const user = token ? await verifySupabaseUser(token) : null;
  if (!user) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const ns = envBag.GOTCHI_TOWER;
  if (!ns) {
    // Fallback: no DO binding in this env — reject upgrade with clear message
    return jsonResponse(
      {
        ok: false,
        error:
          "Gotchi Tower multiplayer Durable Object is not bound yet. Redeploy with GOTCHI_TOWER binding.",
      },
      503,
    );
  }

  const id = ns.idFromName(`tower:${eventId}`);
  const stub = ns.get(id);
  const forwardUrl = new URL(request.url);
  forwardUrl.searchParams.set("userId", user.id);
  forwardUrl.searchParams.set("name", user.email?.split("@")[0] || "Scholar");
  return stub.fetch(
    new Request(forwardUrl.toString(), {
      method: request.method,
      headers: request.headers,
    }),
  );
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
      const envBag = resolveEnv(env, request);

      if (url.pathname === "/api/keepalive" || url.pathname === "/cdn-cgi/keepalive") {
        return handleKeepAlive();
      }

      if (url.pathname === "/api/push/health") {
        return handlePushHealth(env, envBag, request);
      }

      if (url.pathname === "/api/push/notify") {
        return handlePushNotify(request, envBag);
      }

      if (url.pathname === "/api/ai/generate-reviewer") {
        return handleGenerateReviewer(request, envBag);
      }

      if (url.pathname === "/api/ai/generate-tower-questions") {
        return handleGenerateTowerQuestions(request, envBag);
      }

      if (url.pathname === "/api/ai/generate-escape-room") {
        return handleGenerateEscapeRoom(request, envBag);
      }

      if (url.pathname === "/api/ai/gemini-health") {
        return handleGeminiHealth(envBag);
      }

      if (url.pathname === "/api/gotchi-tower/ws") {
        return handleGotchiTowerWs(request, envBag);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env ?? nitroEnv() ?? envBag, ctx);
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
