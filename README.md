# tweet.stream 🐦⚡

> **Open Source X (Twitter) REST API & Model Context Protocol (MCP) Server**  
> Built by **Vartabase AI** • Designed for AI Agents (Claude Desktop, Cursor, Antigravity, Windsurf)

---

## ✨ Features

- 🔑 **Zero-Key "Connect with X" (OAuth 2.0 PKCE)**: Users don't need a Twitter Developer account. They simply click "Connect with X" on `tweet.stream`, authorize the app, get their personal `ts_live_...` token, and immediately let AI agents tweet on their behalf.
- 🛡️ **BYOK (Bring Your Own Key) Support**: If users or self-hosters want complete privacy or higher rate limits, they can supply their own X API Key / Secret / Access Tokens directly in `.env` or MCP environment variables.
- 🤖 **Full MCP Support (Stdio & Remote SSE)**:
  - **Local Stdio CLI**: Run `npx tweet-stream` directly in Claude Desktop or Cursor.
  - **Remote SSE MCP**: Connect directly to `https://tweet.stream/mcp/sse?key=...` with zero local processes.
- 🚀 **REST API**: Simple, clean HTTP endpoints for tweeting, replying, reading timelines, and profile inspection.
- 🔄 **Auto-Refreshing Tokens**: Handles OAuth 2.0 PKCE token lifecycle and refreshing in the background.

---

## 🛠️ MCP Tools Included

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `post_tweet` | `text` (required), `quote_tweet_id` (optional) | Posts a status update (up to 280 chars) to X. |
| `reply_to_tweet` | `tweet_id` (required), `text` (required) | Replies directly to an existing tweet thread. |
| `get_tweet` | `tweet_id` (required) | Fetches text, author handle, and engagement metrics (likes, retweets). |
| `read_timeline` | `limit` (optional, default 10) | Reads recent active tweets from user timeline *(requires X Basic Tier+)*. |
| `search_tweets` | `query` (required), `limit` (optional) | Searches recent active tweets on X *(requires X Basic Tier+)*. |
| `get_my_profile` | None | Returns profile info, handle, bio, follower count of authenticated account. |

---

## 🚀 Quickstart for AI Clients

### Option A: Local Stdio CLI (Claude Desktop / Cursor)

Add the following to your MCP client configuration (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` or `.cursor/mcp.json`):

#### 1. Zero-Key Mode (using your `tweet.stream` Token):
```json
{
  "mcpServers": {
    "tweet-stream": {
      "command": "npx",
      "args": ["-y", "tweet-stream"],
      "env": {
        "TWEET_STREAM_API_KEY": "ts_live_your_token_from_tweet_stream"
      }
    }
  }
}
```

#### 2. BYOK Mode (Direct X Developer Keys):
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

---

### Option B: Remote SSE MCP (Direct URL)

If your MCP client supports Remote SSE (or using an SSE gateway):
```json
{
  "mcpServers": {
    "tweet-stream": {
      "url": "https://tweet.stream/mcp/sse?key=ts_live_your_token_from_tweet_stream"
    }
  }
}
```

---

## 🌐 Deploying `tweet.stream` (For Vartabase AI / Hosters)

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

## ⚠️ Understanding Twitter (X) API Tiers

- **Free Tier**: Write-only access (~1,500 posts/month app-level, 500 posts/month per user). **Reading tweets (timeline, search) is blocked by X on the Free tier.**
- **Basic Tier ($100/month)**: Allows reading up to 10,000 tweets/month and posting 50,000 tweets/month. Required if you want `read_timeline` and `search_tweets` active for users on your hosted `tweet.stream` app.
- **Pro Tier ($5,000/month)**: High volume production tier.

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
