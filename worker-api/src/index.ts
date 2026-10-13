import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "../../src/mcp/tools.js";

type Env = Cloudflare.Env & {
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  OWNER_SECRET?: string;
  ALLOWED_USERNAMES?: string;
  OWNER_API_KEY?: string;
};

interface Session {
  api_key_hash: string;
  user_id: string;
  username: string;
  name: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
}

const X_API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const IMAGE_SIGNATURES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/gif": [0x47, 0x49, 0x46, 0x38],
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
      if (url.pathname === "/health") {
        await env.DB.prepare("SELECT 1").first();
        return json({ status: "ok", service: "tweet.stream", runtime: "cloudflare-workers", toolsCount: TOOLS.length });
      }

      if (url.pathname === "/auth/login" && request.method === "GET") return await beginOAuth(request, env);
      if (url.pathname === "/auth/callback" && request.method === "GET") return await finishOAuth(request, env);
      if (url.pathname === "/mcp" || url.pathname === "/mcp/sse") {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
        return await handleMcp(request, env);
      }
      if (url.pathname.startsWith("/api/v1/")) return await handleApi(request, env);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_error", path: url.pathname, message: errorMessage(error) }));
      return json({ error: errorMessage(error) }, error instanceof HttpError ? error.status : 500);
    }
  },
};

async function beginOAuth(request: Request, env: Env): Promise<Response> {
  if (!env.X_CLIENT_ID) return json({ error: "X OAuth is not configured. Set X_CLIENT_ID." }, 503);
  const url = new URL(request.url);
  if (env.OWNER_SECRET) {
    const providedSecret = url.searchParams.get("secret") || request.headers.get("x-owner-secret");
    if (providedSecret !== env.OWNER_SECRET) {
      return json({ error: "Access denied. Valid owner secret required (?secret=...)." }, 403);
    }
  }
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = `${env.BASE_URL || new URL(request.url).origin}/auth/callback`;
  const encryptedVerifier = await encrypt(verifier, env);
  const expiry = Date.now() + 10 * 60 * 1000;
  await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(Date.now()).run();
  await env.DB.prepare(
    "INSERT INTO oauth_states (state_hash, code_verifier, expires_at) VALUES (?, ?, ?)",
  ).bind(await sha256(state), encryptedVerifier, expiry).run();

  const authorize = new URL("https://twitter.com/i/oauth2/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return Response.redirect(authorize.toString(), 302);
}

async function finishOAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");
  if (authError) return htmlPage("X authorization failed", `<p>${escapeHtml(authError)}</p>`, 400);
  if (!code || !state || !env.X_CLIENT_ID) return json({ error: "Missing OAuth code/state or X_CLIENT_ID." }, 400);

  const stateHash = await sha256(state);
  const pending = await env.DB.prepare(
    "SELECT code_verifier FROM oauth_states WHERE state_hash = ? AND expires_at > ?",
  ).bind(stateHash, Date.now()).first<{ code_verifier: string }>();
  if (!pending) return json({ error: "Invalid or expired OAuth state." }, 400);
  await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash = ?").bind(stateHash).run();

  const redirectUri = `${env.BASE_URL || url.origin}/auth/callback`;
  const form = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: redirectUri,
    code_verifier: await decrypt(pending.code_verifier, env),
  });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (env.X_CLIENT_SECRET) headers.set("authorization", `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`);
  const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body: form });
  const tokenData = await tokenResponse.json<TokenPayload>();
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error(`X token exchange failed (${tokenResponse.status}).`);

  const profileResponse = await fetch(`${X_API}/users/me?user.fields=name,username`, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileResponse.json<{ data?: { id: string; username: string; name: string } }>();
  if (!profileResponse.ok || !profile.data) throw new Error(`X profile lookup failed (${profileResponse.status}).`);

  if (env.ALLOWED_USERNAMES) {
    const allowed = env.ALLOWED_USERNAMES.split(",").map((s) => s.trim().toLowerCase());
    if (!allowed.includes(profile.data.username.toLowerCase())) {
      return htmlPage("Access Denied", `<p>Twitter account @${escapeHtml(profile.data.username)} is not authorized on this private instance.</p>`, 403);
    }
  }

  const apiKey = env.OWNER_API_KEY || `ts_live_${randomHex(24)}`;
  const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null;
  await env.DB.prepare(`
    INSERT INTO user_sessions (api_key_hash, user_id, username, name, access_token, refresh_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      api_key_hash=excluded.api_key_hash, username=excluded.username, name=excluded.name,
      access_token=excluded.access_token, refresh_token=excluded.refresh_token,
      expires_at=excluded.expires_at, created_at=excluded.created_at
  `).bind(
    await sha256(apiKey), profile.data.id, profile.data.username, profile.data.name,
    await encrypt(tokenData.access_token, env),
    tokenData.refresh_token ? await encrypt(tokenData.refresh_token, env) : null,
    expiresAt, Date.now(),
  ).run();

  return htmlPage("Connected to tweet.stream", `
    <h1>Connected to X as @${escapeHtml(profile.data.username)}</h1>
    <p>Your private MCP API key for Cursor / AI clients:</p>
    <pre style="background:#161b22;padding:12px;border-radius:6px;font-size:15px;color:#58a6ff;word-break:break-all;">${escapeHtml(apiKey)}</pre>
    <p>Add to your <code>~/.cursor/mcp.json</code>:</p>
    <pre style="background:#161b22;padding:12px;border-radius:6px;font-size:13px;color:#c9d1d9;">{
  "mcpServers": {
    "tweet-stream": {
      "url": "${escapeHtml(env.BASE_URL || url.origin)}/mcp",
      "headers": {
        "Authorization": "Bearer ${escapeHtml(apiKey)}"
      }
    }
  }
}</pre>
  `);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const token = await getAccessToken(request, env);
  const path = url.pathname.replace(/^\/api\/v1/, "");

  if (method === "POST" && path === "/tweet") {
    const body = await request.json<{ text?: string; quoteTweetId?: string; imageBase64?: string; imageMimeType?: string }>();
    if (!body.text?.trim()) return json({ error: 'Field "text" is required.' }, 400);
    if (body.text.length > 280) return json({ error: "Text exceeds 280 characters." }, 400);
    const mediaIds = body.imageBase64 || body.imageMimeType ? [await uploadImage(body.imageBase64 || "", body.imageMimeType || "", token)] : undefined;
    return xJson("/tweets", token, { method: "POST", body: JSON.stringify({ text: body.text, ...(body.quoteTweetId ? { quote_tweet_id: body.quoteTweetId } : {}), ...(mediaIds ? { media: { media_ids: mediaIds } } : {}) }) });
  }
  if (method === "POST" && path === "/reply") {
    const body = await request.json<{ tweetId?: string; text?: string }>();
    if (!body.tweetId || !body.text?.trim()) return json({ error: 'Fields "tweetId" and "text" are required.' }, 400);
    return xJson("/tweets", token, { method: "POST", body: JSON.stringify({ text: body.text, reply: { in_reply_to_tweet_id: body.tweetId } }) });
  }
  if (method === "GET" && path.startsWith("/tweet/")) return xJson(tweetLookupPath(path.slice(7)), token);
  if (method === "GET" && path === "/me") return xJson("/users/me?user.fields=description,public_metrics,profile_image_url", token);
  if (method === "GET" && path === "/timeline") {
    const me = await xJsonData<{ data: { id: string } }>("/users/me", token);
    return xJson(`/users/${encodeURIComponent(me.data.id)}/tweets?max_results=${clampLimit(url.searchParams.get("limit"), 10, 5, 100)}&tweet.fields=created_at,public_metrics`, token);
  }
  if (method === "GET" && path === "/search") {
    const query = url.searchParams.get("q");
    if (!query) return json({ error: 'Query parameter "q" is required.' }, 400);
    const params = new URLSearchParams({ query, max_results: String(clampLimit(url.searchParams.get("limit"), 10, 10, 100)), "tweet.fields": "created_at,public_metrics,author_id", expansions: "author_id", "user.fields": "username,name" });
    return xJson(`/tweets/search/recent?${params}`, token);
  }
  return json({ error: "Not found" }, 404);
}

export async function uploadImage(base64: string, mimeType: string, token: string): Promise<string> {
  const signature = IMAGE_SIGNATURES[mimeType];
  if (!signature) throw new HttpError("Image type must be PNG, JPEG, or GIF.", 400);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new HttpError("Image must be valid standard base64 data.", 400);
  }
  let binary: string;
  try { binary = atob(base64); } catch { throw new HttpError("Image must be valid standard base64 data.", 400); }
  if (!binary.length) throw new HttpError("Image cannot be empty.", 400);
  if (binary.length > 5 * 1024 * 1024) throw new HttpError("Image must be 5 MiB or smaller.", 400);
  if (!signature.every((byte, index) => binary.charCodeAt(index) === byte)) {
    throw new HttpError("Image data does not match image_mime_type.", 400);
  }
  const response = await fetch(`${X_API}/media/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ media: base64, media_category: "tweet_image" }),
  });
  const payload = await response.json() as { data?: { id?: string }; errors?: Array<{ detail?: string; title?: string }> };
  if (!response.ok || !payload.data?.id) {
    throw new Error(payload.errors?.[0]?.detail || payload.errors?.[0]?.title || `X media upload failed (${response.status}).`);
  }
  return payload.data.id;
}

function tweetLookupPath(id: string): string {
  const params = new URLSearchParams({ "tweet.fields": "created_at,author_id,public_metrics", expansions: "author_id", "user.fields": "username,name" });
  return `/tweets/${encodeURIComponent(id)}?${params}`;
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  // Validate credentials before advertising tools; no X endpoint is called here.
  await getAccessToken(request, env);

  // Normalize Accept header to prevent SDK 406 on client variations
  const reqHeaders = new Headers(request.headers);
  const accept = reqHeaders.get("accept");
  if (!accept || accept === "*/*" || !accept.includes("text/event-stream")) {
    reqHeaders.set("accept", "application/json, text/event-stream");
  }
  const mcpRequest = new Request(request, { headers: reqHeaders });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    allowedHosts: ["tweet.stream", "www.tweet.stream", "tweet-stream-api.ashaya.workers.dev", "localhost", "localhost:8787", "localhost:8788", "127.0.0.1", "127.0.0.1:8787", "127.0.0.1:8788"],
    enableDnsRebindingProtection: true,
  });
  const server = new Server(
    { name: "tweet-stream", version: "0.2.0", title: "tweet.stream", websiteUrl: "https://tweet.stream" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (rpc) => {
    const token = await getAccessToken(request, env);
    const result = await callTool(rpc.params.name, (rpc.params.arguments || {}) as Record<string, unknown>, token);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
  await server.connect(transport);
  const response = await transport.handleRequest(mcpRequest);
  if (request.method !== "GET") {
    await transport.close();
    await server.close();
  }
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  if (name === "post_tweet") {
    const text = String(args.text || "").trim();
    if (!text) throw new Error("Tweet text cannot be empty.");
    if (text.length > 280) throw new Error(`Tweet exceeds 280 characters (${text.length}).`);
    const mediaIds = args.image_base64 || args.image_mime_type ? [await uploadImage(String(args.image_base64 || ""), String(args.image_mime_type || ""), token)] : undefined;
    return xJsonData("/tweets", token, { method: "POST", body: JSON.stringify({ text, ...(args.quote_tweet_id ? { quote_tweet_id: String(args.quote_tweet_id) } : {}), ...(mediaIds ? { media: { media_ids: mediaIds } } : {}) }) });
  }
  if (name === "reply_to_tweet") {
    const text = String(args.text || "").trim();
    const tweetId = String(args.tweet_id || "");
    if (!text || !tweetId) throw new Error("tweet_id and reply text are required.");
    return xJsonData("/tweets", token, { method: "POST", body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }) });
  }
  if (name === "get_tweet") return xJsonData(tweetLookupPath(String(args.tweet_id || "")), token);
  if (name === "get_my_profile") return xJsonData("/users/me?user.fields=description,public_metrics,profile_image_url", token);
  if (name === "read_timeline") {
    const me = await xJsonData<{ data: { id: string } }>("/users/me", token);
    const limit = clampLimit(args.limit, 10, 5, 100);
    return xJsonData(`/users/${encodeURIComponent(me.data.id)}/tweets?max_results=${limit}&tweet.fields=created_at,public_metrics`, token);
  }
  if (name === "search_tweets") {
    const query = String(args.query || "").trim();
    if (!query) throw new Error("Search query is required.");
    const params = new URLSearchParams({ query, max_results: String(clampLimit(args.limit, 10, 10, 100)), "tweet.fields": "created_at,public_metrics,author_id", expansions: "author_id", "user.fields": "username,name" });
    return xJsonData(`/tweets/search/recent?${params}`, token);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function getAccessToken(request: Request, env: Env): Promise<string> {
  const directToken = request.headers.get("x-user-access-token");
  if (directToken?.trim()) {
    return directToken.trim();
  }

  const header = request.headers.get("authorization");
  const apiKey = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || request.headers.get("x-api-key");
  if (!apiKey) {
    throw new HttpError("Missing API key. Use Authorization: Bearer <ts_live_...> or X-User-Access-Token header.", 401);
  }

  if (!apiKey.startsWith("ts_live_") && apiKey.length > 20) {
    return apiKey;
  }

  let session = await env.DB.prepare("SELECT * FROM user_sessions WHERE api_key_hash = ?").bind(await sha256(apiKey)).first<Session>();

  if (!session && env.OWNER_API_KEY && apiKey === env.OWNER_API_KEY) {
    session = await env.DB.prepare("SELECT * FROM user_sessions ORDER BY created_at DESC LIMIT 1").first<Session>();
  }

  if (!session) throw new HttpError("Invalid tweet.stream API key.", 401);

  if (session.expires_at && session.expires_at < Date.now() + 120_000 && session.refresh_token && env.X_CLIENT_ID) {
    const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: await decrypt(session.refresh_token, env), client_id: env.X_CLIENT_ID });
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
    if (env.X_CLIENT_SECRET) headers.set("authorization", `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`);
    const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body: form });
    const refreshed = await response.json<TokenPayload>();
    if (response.ok && refreshed.access_token) {
      const refreshToken = refreshed.refresh_token || await decrypt(session.refresh_token, env);
      session.access_token = await encrypt(refreshed.access_token, env);
      session.refresh_token = await encrypt(refreshToken, env);
      session.expires_at = refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null;
      await env.DB.prepare("UPDATE user_sessions SET access_token=?, refresh_token=?, expires_at=? WHERE api_key_hash=?")
        .bind(session.access_token, session.refresh_token, session.expires_at, session.api_key_hash).run();
    }
  }
  return decrypt(session.access_token, env);
}

interface TokenPayload { access_token?: string; refresh_token?: string; expires_in?: number; }

async function xJson(path: string, token: string, init?: RequestInit): Promise<Response> {
  return json(await xJsonData(path, token, init));
}

async function xJsonData<T = unknown>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(`${X_API}${path.startsWith("/") ? path : `/${path}`}`, { ...init, headers });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : `X API returned HTTP ${response.status}.`;
    throw new Error(detail);
  }
  return data as T;
}

async function encrypt(value: string, env: Env): Promise<string> {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decrypt(value: string, env: Env): Promise<string> {
  const [ivText, dataText] = value.split(".");
  if (!ivText || !dataText) throw new Error("Stored token could not be decrypted.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivText) }, await encryptionKey(env), base64ToBytes(dataText));
  return new TextDecoder().decode(plaintext);
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  if (!env.TOKEN_ENCRYPTION_KEY || !/^[a-f0-9]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters.");
  }
  const raw = Uint8Array.from(env.TOKEN_ENCRYPTION_KEY.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sha256(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function sha256Base64Url(value: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function randomBase64Url(size: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function randomHex(size: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(size)));
}

function bytesToHex(bytes: Uint8Array): string { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function bytesToBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}
function bytesToBase64Url(bytes: Uint8Array): string { return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function clampLimit(value: unknown, fallback: number, min = 1, max = 100): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(Math.floor(number), min), max) : fallback;
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}
function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><body style="font:16px system-ui;max-width:650px;margin:10vh auto;padding:24px;background:#0b0e14;color:#f0f3f6"><h1>${escapeHtml(title)}</h1>${body}</body></html>`, { status, headers: { ...corsHeaders(), "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
}
function corsHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, X-API-Key, Mcp-Session-Id, Mcp-Protocol-Version",
    "access-control-expose-headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  };
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unexpected server error."; }

class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
