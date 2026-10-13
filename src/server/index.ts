import express from 'express';
import cors from 'cors';
import { config, hasOAuthAppCredentials, hasByokCredentials } from '../config.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { mcpRouter } from './routes/mcp-sse.js';
import { TOOLS } from '../mcp/tools.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount sub-routers
app.use('/auth', authRouter);
app.use('/api/v1', apiRouter);
app.use('/mcp', mcpRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tweet.stream',
    oauthConfigured: hasOAuthAppCredentials(),
    byokConfigured: hasByokCredentials(),
    toolsCount: TOOLS.length,
    timestamp: new Date().toISOString(),
  });
});

// Landing page UI
app.get('/', (req, res) => {
  const oauthReady = hasOAuthAppCredentials();
  const byokReady = hasByokCredentials();

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tweet.stream — Open Source X API & MCP Server</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0e14;
      --card-bg: #151922;
      --card-border: #232936;
      --accent: #1d9bf0;
      --accent-glow: rgba(29, 155, 240, 0.25);
      --text: #f0f3f6;
      --text-muted: #8b949e;
      --green: #2ea043;
      --yellow: #d29922;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }
    .hero {
      padding: 80px 24px 40px;
      max-width: 900px;
      margin: 0 auto;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(29, 155, 240, 0.12);
      border: 1px solid rgba(29, 155, 240, 0.3);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 52px;
      font-weight: 800;
      letter-spacing: -1.5px;
      margin: 0 0 16px 0;
      line-height: 1.15;
    }
    h1 span {
      background: linear-gradient(135deg, #1d9bf0 0%, #a5d8ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      font-size: 19px;
      color: var(--text-muted);
      max-width: 680px;
      margin: 0 auto 36px;
    }
    .cta-group {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 48px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 4px 20px var(--accent-glow);
      border: none;
    }
    .btn-primary:hover {
      background: #1a8cd8;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
    }
    .btn-secondary:hover {
      border-color: #384252;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 24px 80px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card p {
      margin: 0;
      color: var(--text-muted);
      font-size: 14px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-green { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .dot-yellow { background: var(--yellow); }
    pre {
      background: #090c10;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      overflow-x: auto;
      color: #e6edf3;
      margin-top: 12px;
    }
    .tool-tag {
      display: inline-block;
      background: #1c2331;
      border: 1px solid #2b364c;
      padding: 4px 10px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #79c0ff;
      margin: 4px 4px 4px 0;
    }
    footer {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 13px;
      border-top: 1px solid var(--card-border);
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="badge">Open Source • Vartabase AI</div>
    <h1>Tweet with any AI.<br><span>Zero API Keys Needed.</span></h1>
    <p class="subtitle">
      <strong>tweet.stream</strong> is an open-source bridge connecting Model Context Protocol (MCP) clients and REST APIs directly to X (Twitter). Sign in once via OAuth, or bring your own keys.
    </p>

    <div class="cta-group">
      <a href="/auth/login" class="btn btn-primary">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        Connect with X (OAuth 2.0)
      </a>
      <a href="#setup" class="btn btn-secondary">
        View MCP Configuration
      </a>
    </div>
  </div>

  <div class="container">
    <div class="grid">
      <div class="card">
        <h3>
          <span class="status-dot ${oauthReady ? 'dot-green' : 'dot-yellow'}"></span>
          Zero-Key OAuth 2.0
        </h3>
        <p>${oauthReady ? 'X OAuth App configured and ready.' : 'Requires X_CLIENT_ID in .env'}</p>
        <p style="margin-top: 10px; font-size: 13px;">Users can authenticate in 1-click and immediately post tweets via Claude or Cursor without registering their own Twitter Developer account.</p>
      </div>

      <div class="card">
        <h3>
          <span class="status-dot ${byokReady ? 'dot-green' : 'dot-yellow'}"></span>
          BYOK Direct Mode
        </h3>
        <p>${byokReady ? 'Active Twitter keys detected.' : 'Optional: Supply keys in .env'}</p>
        <p style="margin-top: 10px; font-size: 13px;">Run 100% locally and privately by supplying your own X API Key, Secret, and Access Tokens.</p>
      </div>

      <div class="card">
        <h3>
          <span class="status-dot dot-green"></span>
          Dual MCP Transports
        </h3>
        <p>Stdio CLI & Remote SSE</p>
        <p style="margin-top: 10px; font-size: 13px;">Run locally via <code>npx tweet-stream</code> or connect remotely via Server-Sent Events at <code>/mcp/sse</code>.</p>
      </div>
    </div>

    <div class="card" id="setup" style="margin-bottom: 30px;">
      <h2 style="margin-top: 0; font-size: 22px;">🛠️ MCP Client Setup</h2>
      <p>Configure Claude Desktop (<code>claude_desktop_config.json</code>) or Cursor (<code>.cursor/mcp.json</code>):</p>
      
      <h4 style="margin-bottom: 6px; color: var(--accent);">Option A: Local Stdio CLI (with your tweet.stream Token)</h4>
      <pre><code>{
  "mcpServers": {
    "tweet-stream": {
      "command": "node",
      "args": ["/absolute/path/to/tweetstream/dist/cli.js"],
      "env": {
        "TWEET_STREAM_API_KEY": "YOUR_TWEET_STREAM_TOKEN_HERE",
        "TOKEN_STORE_PATH": "/absolute/path/to/tweetstream/.tokens.json"
      }
    }
  }
}</code></pre>

      <h4 style="margin-top: 20px; margin-bottom: 6px; color: var(--accent);">Option B: Remote SSE MCP</h4>
      <pre><code>{
  "mcpServers": {
    "tweet-stream": {
      "url": "${config.baseUrl}/mcp/sse",
      "headers": { "Authorization": "Bearer YOUR_TWEET_STREAM_TOKEN_HERE" }
    }
  }
}</code></pre>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; font-size: 22px;">⚡ Supported MCP Tools</h2>
      <p>Available to any LLM once connected:</p>
      <div style="margin-top: 12px;">
        <span class="tool-tag">post_tweet</span> — Post a new tweet (status update)
        <br><br>
        <span class="tool-tag">reply_to_tweet</span> — Reply directly to an existing tweet thread
        <br><br>
        <span class="tool-tag">get_tweet</span> — Fetch tweet details, author, and like/retweet metrics
        <br><br>
        <span class="tool-tag">read_timeline</span> — Read recent active tweets from user timeline
        <br><br>
        <span class="tool-tag">search_tweets</span> — Search recent active tweets across X
        <br><br>
        <span class="tool-tag">get_my_profile</span> — Get details of the authenticated account
      </div>
    </div>
  </div>

  <footer>
    <strong>tweet.stream</strong> • Created with pride by <strong>Vartabase AI</strong>
  </footer>
</body>
</html>
  `);
});

// Start listening
export function startServer(port: number = config.port) {
  return app.listen(port, config.host, () => {
    console.log(`\n🚀 [tweet.stream] Server running on http://${config.host}:${port}`);
    console.log(`   - Web UI: http://localhost:${port}`);
    console.log(`   - REST API: http://localhost:${port}/api/v1`);
    console.log(`   - Remote MCP (SSE): http://localhost:${port}/mcp/sse`);
    console.log(`   - OAuth Login: http://localhost:${port}/auth/login\n`);
  });
}

// Auto-start if run directly
if (process.argv[1]?.endsWith('server/index.ts') || process.argv[1]?.endsWith('server/index.js')) {
  startServer();
}

export default app;
