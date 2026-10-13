# tweet.stream 🐦⚡

<p align="center">
  <img src="assets/brand/banner.png" alt="tweet.stream banner" width="100%" />
</p>

> **Open Source, Self-Hostable X (Twitter) REST API & Model Context Protocol (MCP) Server**  
> Built for AI Agents (Claude Desktop, Cursor, Antigravity, Windsurf) • 100% Open Source (Apache 2.0)

---

## 🌟 Why tweet.stream?

Connecting autonomous coding agents to social platforms shouldn't mean sharing rate limits with strangers or trusting third-party servers with your API keys.

**tweet.stream** is an open-source, private bridge between your AI tools and X (Twitter):
- 🛡️ **100% Self-Hosted & Private**: Your keys, your tokens, your database. No shared quotas or surprise rate limit exhaustion.
- 🔑 **Bring Your Own Credentials (BYOC / BYOK)**: Connect via direct X Developer API keys (OAuth 1.0a) or user access tokens for instant zero-server CLI use.
- ⚡ **Self-Hosted OAuth 2.0 PKCE Server**: Run your own lightweight server (Node, Docker, or Cloudflare Workers + D1) with automated token refreshing.
- 🤖 **Universal MCP Support**: Works out-of-the-box with Cursor, Claude Desktop, Antigravity, and Windsurf via local stdio (`npx tweet-stream`) or remote Streamable HTTP / SSE (`/mcp`).
- 🚀 **Clean REST API**: Lightweight HTTP endpoints for tweeting, quoting, thread replies, timeline inspection, and searches.

---

## 🛠️ MCP Tools Included

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `post_tweet` | `text` (required), `quote_tweet_id` (optional), `image_base64` + `image_mime_type` (optional) | Posts text or a PNG, JPEG, or GIF image (up to 5 MiB) to X. |
| `reply_to_tweet` | `tweet_id` (required), `text` (required) | Replies directly to an existing tweet thread. |
| `get_tweet` | `tweet_id` (required) | Fetches text, author handle, and engagement metrics (likes, retweets). |
| `read_timeline` | `limit` (optional, default 10) | Reads recent active tweets from the authenticated user's timeline; X usage is metered. |
| `search_tweets` | `query` (required), `limit` (optional) | Searches recent active tweets on X; X usage is metered. |
| `get_my_profile` | None | Returns profile info, handle, bio, follower count of authenticated account. |

---

## 🚀 Quickstart

### Option 1: Direct Keys / BYOK (No Server Needed)

If you already have developer keys from [developer.x.com](https://developer.x.com), add this directly to your MCP client config (e.g. `~/.cursor/mcp.json` or `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tweet-stream": {
      "command": "npx",
      "args": ["-y", "tweet-stream"],
      "env": {
        "X_API_KEY": "your_consumer_key",
        "X_API_SECRET": "your_consumer_secret",
        "X_ACCESS_TOKEN": "your_access_token",
        "X_ACCESS_TOKEN_SECRET": "your_access_token_secret"
      }
    }
  }
}
```

### Option 2: Self-Host via Local Node / Docker

Clone the repo, set up OAuth 2.0 PKCE, connect your account once, and run locally:

```json
{
  "mcpServers": {
    "tweet-stream": {
      "command": "node",
      "args": ["/absolute/path/to/tweet_stream/dist/cli.js"],
      "env": {
        "TWEET_STREAM_API_KEY": "ts_live_YOUR_LOCAL_KEY",
        "TOKEN_STORE_PATH": "/absolute/path/to/tweet_stream/.tokens.json"
      }
    }
  }
}
```

### Option 3: Self-Host via Cloudflare Worker + D1 (Remote MCP)

Deploy your own private edge instance on Cloudflare Workers and D1:

```json
{
  "mcpServers": {
    "tweet-stream": {
      "url": "https://your-domain.com/mcp",
      "headers": {
        "Authorization": "Bearer ts_live_your_private_token"
      }
    }
  }
}
```

---

## 🌐 Self-Hosting Guide

`tweet.stream` is designed to be completely self-hosted. You can run it on your own machine, a private VPS, or as a serverless Cloudflare Worker with D1. In all cases, your agent communicates through your own credentials, giving you complete isolation and rate limit control.

### 1. Register Your App on X Developer Portal
1. Navigate to [developer.x.com](https://developer.x.com/en/portal/dashboard).
2. Create a new **Project & App** (e.g. `tweet.stream`).
3. Under **User authentication settings**:
   - **App permissions**: `Read and Write`
   - **Type of App**: `Web App, Automated App or Bot` (Confidential Client)
   - **Callback URI**: `https://tweet.stream/auth/callback` (and `http://localhost:3030/auth/callback` for dev)
   - **Website URL**: `https://tweet.stream`
4. Copy the **OAuth 2.0 Client ID** and **Client Secret**.

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
Fill in `.env`:
```env
PORT=3030
HOST=0.0.0.0
BASE_URL=https://tweet.stream

X_CLIENT_ID=your_x_oauth2_client_id
X_CLIENT_SECRET=your_x_oauth2_client_secret
X_REDIRECT_URI=https://tweet.stream/auth/callback
```

### 3. Build & Run
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the web server & API
npm start
```
The server will now be live with:
- Landing Page & OAuth: `http://localhost:3030/`
- REST API: `http://localhost:3030/api/v1`
- Remote MCP (SSE): `http://localhost:3030/mcp/sse`
- Health check: `http://localhost:3030/health`

For an internet-facing host, put the Node service behind a TLS reverse proxy, keep `.env` and `.tokens.json` outside source control, and configure the OAuth callback to the public `/auth/callback` URL. A Docker example is included (`docker compose up --build`); persist the token store volume and back it up securely. For a low-cost managed deployment, follow the Cloudflare Worker + D1 guide below.

### Self-host with your own X app

Create an X Developer App under your own account, enable user authentication with read/write permissions, and set the callback URL to your host's `/auth/callback`. The app needs the OAuth scopes `tweet.read tweet.write users.read media.write offline.access`; users who connected before `media.write` was added must disconnect/re-authorize to grant image uploads. Use only your own OAuth client credentials in the host's secret store. Never commit `.env`, `.dev.vars`, `.tokens.json`, Wrangler state, or downloaded developer credentials.

For the simplest local setup:

```sh
git clone https://github.com/ashayas/tweetstream.git
cd tweetstream
npm ci
cp .env.example .env
# edit .env with your X OAuth client ID/secret and the matching callback URL
npm run build
npm start
```

The Node service defaults to port 3000. Set `BASE_URL`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_REDIRECT_URI` in `.env`. Open `http://localhost:3000/auth/login`, authorize your X account, and use the resulting local session through the service. For public hosting, use HTTPS and a private persistent volume for `.tokens.json`; restrict filesystem and backup access because the file contains user tokens. The included Docker Compose file uses the same `.env` setup.

The local stdio MCP server can also use the current checkout without running HTTP: build with `npm run build` and configure the client command as `node /absolute/path/to/tweetstream/dist/cli.js`. For BYOK, provide the user's own X API credentials to that MCP process. The root `.env.example` lists supported variables.

---

## Cloudflare Workers API (Worker + D1)

The `worker-api/` project is the edge-native hosted API. It uses a stateless fetch handler and MCP Streamable HTTP at `/mcp`; D1 stores OAuth sessions and short-lived PKCE state. X access/refresh tokens are encrypted in D1 with `TOKEN_ENCRYPTION_KEY`; API keys are stored as SHA-256 hashes. The existing Node server and local stdio MCP remain available.

### Run locally

```bash
npm run worker:types
npm run worker:migrate:local
npm run worker:dev
```

The Worker listens on `http://localhost:8787`. `/health` checks the Worker and D1 binding. Set `BASE_URL=http://localhost:8787`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` in `worker-api/.dev.vars` to test the OAuth callback locally. Add `http://localhost:8787/auth/callback` to your X app's callback URLs. Generate a 32-byte encryption key with `openssl rand -hex 32` and keep it private. The local D1 database and `.dev.vars` are ignored by git.

### Prepare a production deployment

```bash
cp worker-api/wrangler.toml.example worker-api/wrangler.toml
npx wrangler d1 create tweet-stream-production --location wnam --update-config=false --config worker-api/wrangler.toml
# Replace the placeholder database_id in worker-api/wrangler.toml with the ID printed above
npm run worker:types
npx wrangler d1 migrations apply tweet-stream-production --remote --config worker-api/wrangler.toml
npx wrangler secret put X_CLIENT_ID --config worker-api/wrangler.toml
npx wrangler secret put X_CLIENT_SECRET --config worker-api/wrangler.toml
npx wrangler secret put TOKEN_ENCRYPTION_KEY --config worker-api/wrangler.toml
npx wrangler deploy --config worker-api/wrangler.toml
```

For your own production instance, replace `tweet.stream` in `BASE_URL`, the four Worker route patterns, and each `zone_name` with your domain, and configure that domain as a Cloudflare zone. Use your own X Developer App and set its callback to `https://your-domain/auth/callback`; put its client credentials and a newly generated encryption key in Wrangler secrets. The default example points at tweet.stream and is not reusable as another operator's routing config without those changes. MCP clients should use `https://your-domain/mcp` with their `ts_live_...` key as an Authorization Bearer token. `/mcp/sse` is the old Node-only SSE transport and returns a migration hint on the Worker. The Worker API can run without the marketing site; if you want policy pages, serve your own `/privacy` and `/tos` content or deploy a static site on the same domain.

Creating the remote D1 database and deploying the Worker are separate from local development; do not run the remote commands until you intend to create production resources and switch those routes.

---

## 📡 REST API Reference

All requests can be authenticated via `Authorization: Bearer <ts_live_...>` or `X-API-Key: <ts_live_...>`.

### 1. Post Tweet
```bash
curl -X POST http://localhost:3030/api/v1/tweet \
  -H "Authorization: Bearer ts_live_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world from tweet.stream!"}'
```

For an image, include the image bytes as base64 and the matching MIME type:

```json
{
  "text": "Hello with an image",
  "imageBase64": "<base64-encoded image bytes>",
  "imageMimeType": "image/png"
}
```

### 2. Reply to Tweet
```bash
curl -X POST http://localhost:3030/api/v1/reply \
  -H "Authorization: Bearer ts_live_..." \
  -H "Content-Type: application/json" \
  -d '{"tweetId": "1234567890", "text": "Great perspective!"}'
```

### 3. Get Single Tweet
```bash
curl http://localhost:3030/api/v1/tweet/1234567890 \
  -H "Authorization: Bearer ts_live_..."
```

### 4. Get User Profile
```bash
curl http://localhost:3030/api/v1/me \
  -H "Authorization: Bearer ts_live_..."
```

---

## X API usage and billing

X currently uses prepaid pay-per-use credits rather than the old fixed tiers. Charges belong to the developer project/app whose credentials make the API requests. If users authorize through your hosted X app, their actions consume that app's credits; this can create costs for the operator. If each self-hoster configures their own X app, the X usage is billed to their own developer account. Budget separately for any AI model usage in an MCP client—tweet.stream itself does not call an AI model.

X's current published rates list creating a post at $0.015 per request, or $0.20 when the post contains a URL; reads are metered per resource. Prices can change, and X's Developer Console is authoritative. Set a spending limit, leave auto-recharge disabled unless you intend to enable it, and monitor usage before allowing other people to use your OAuth app. Creating a post does cost money under current X billing. A media upload precedes an image post; check your console's current media/API rates before enabling shared hosted usage.

Image posts are supported by the Node API/MCP and the Worker API when the connected OAuth 2.0 user token includes `media.write` (OAuth 1.0a BYOK credentials may not authorize the v2 media upload endpoint). Supply standard base64 in `image_base64` and the matching `image_mime_type` (`image/png`, `image/jpeg`, or `image/gif`); the project limits decoded image data to 5 MiB. The uploader validates the file signature before sending it to X. No image or post is sent during the local mock test.

---

## 📄 License

Apache-2.0 © [Vartabase AI](https://tweet.stream)

## Website and repository layout

The open-source API and MCP server live at [ashayas/tweetstream](https://github.com/ashayas/tweetstream); the local checkout is named `tweet_stream`.

The marketing website is independently versioned in `landing-page/` and maintained in the private `ashayas/tweet-stream-landing-page` repository. It is excluded from this repository. Run `npm install && npm run dev` inside that separate checkout for the interactive local preview.

- Privacy policy: https://tweet.stream/privacy
- Terms of service: https://tweet.stream/tos
- Brand artwork: `assets/brand/`
- The MCP initialization metadata includes a self-contained bird icon so local clients do not need to fetch it from the website.

Website production hosting is separate from the API. Serve the landing page at `/`, `/privacy`, `/tos`, and `/contact`, and route `/auth/*`, `/api/*`, `/mcp/*`, and `/health` to the core server. See the private landing repository's deployment example.
