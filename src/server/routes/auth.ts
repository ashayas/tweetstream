import { Router, Request, Response } from 'express';
import { generateAuthLink, handleOAuthCallback } from '../../twitter/auth.js';
import { config, hasOAuthAppCredentials } from '../../config.js';
import { TokenStore } from '../../storage/token-store.js';

export const authRouter = Router();

// 1. Initiate OAuth 2.0 PKCE flow
authRouter.get('/login', (req: Request, res: Response) => {
  if (!hasOAuthAppCredentials()) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>tweet.stream - Configuration Needed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1419; color: #f7f9f9; padding: 40px; display: flex; justify-content: center; }
          .card { max-width: 600px; background: #192734; border: 1px solid #38444d; border-radius: 16px; padding: 32px; }
          h2 { color: #1d9bf0; margin-top: 0; }
          code { background: #22303c; padding: 2px 6px; border-radius: 4px; color: #ffd400; }
          a { color: #1d9bf0; text-decoration: none; }
          a:hover { text-decoration: underline; }
          ol { line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚠️ X OAuth2 Credentials Required</h2>
          <p>To enable <strong>Zero-Key "Connect with X"</strong> authentication on <code>tweet.stream</code>, you must configure your X Developer App credentials in <code>.env</code>:</p>
          <ol>
            <li>Go to the <a href="https://developer.x.com/en/portal/dashboard" target="_blank">X Developer Portal</a>.</li>
            <li>Create or select your Project and App (e.g. <code>tweet.stream</code>).</li>
            <li>In <strong>User authentication settings</strong>:
              <ul>
                <li>Permissions: <strong>Read and Write</strong></li>
                <li>App Type: <strong>Web App, Automated App or Bot</strong></li>
                <li>Callback URI: <code>${config.xRedirectUri}</code></li>
                <li>Website URL: <code>${config.baseUrl}</code></li>
              </ul>
            </li>
            <li>Copy the <strong>OAuth 2.0 Client ID</strong> and <strong>Client Secret</strong> into your <code>.env</code> file:
              <pre><code>X_CLIENT_ID=your_client_id_here\nX_CLIENT_SECRET=your_client_secret_here</code></pre>
            </li>
            <li>Restart the server.</li>
          </ol>
        </div>
      </body>
      </html>
    `);
    return;
  }

  try {
    const { url } = generateAuthLink();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Failed to generate authorization link: ${(err as Error).message}`);
  }
});

// 2. Handle callback from Twitter
authRouter.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    res.status(400).send(`OAuth error from X: ${error}`);
    return;
  }

  if (!code || !state) {
    res.status(400).send('Missing code or state parameter in OAuth callback.');
    return;
  }

  try {
    const { session } = await handleOAuthCallback(code, state);
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    }).send(renderConnectedPage(session.apiKey, session.name, session.username));
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>tweet.stream - Authentication Error</title>
        <style>body { font-family: sans-serif; background: #0f1419; color: #f7f9f9; padding: 40px; }</style>
      </head>
      <body>
        <h2 style="color: #f4212e">❌ Authentication Failed</h2>
        <p>${(err as Error).message}</p>
        <p><a href="/auth/login" style="color: #1d9bf0">Try logging in again</a></p>
      </body>
      </html>
    `);
  }
});

// Never accept credentials in a URL: old success links may still exist in browser history.
authRouter.get('/success', (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store').redirect('/');
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function renderConnectedPage(apiKey: string, name: string, username: string): string {
  const safeKey = escapeHtml(apiKey);
  const safeName = escapeHtml(name);
  const safeUsername = escapeHtml(username);
  const safeBaseUrl = escapeHtml(config.baseUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Connected to tweet.stream</title>
<style>
:root{color-scheme:dark;--bg:#0f1419;--card:#192734;--border:#38444d;--text:#f7f9f9;--muted:#8b98a5;--blue:#1d9bf0;--green:#00ba7c}
*{box-sizing:border-box}body{font:16px/1.6 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:40px 20px;display:grid;place-items:center;min-height:100vh}.card{max-width:720px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:32px;box-shadow:0 10px 30px #0008}.badge{color:var(--green);font-weight:700}h1{font-size:clamp(25px,5vw,36px);line-height:1.15}p{color:var(--muted)}code,pre,.key{font-family:ui-monospace,SFMono-Regular,monospace}.keybox{display:flex;gap:12px;align-items:flex-start;background:#090d11;border:1px solid var(--border);border-radius:12px;padding:16px}.key{color:#79c0ff;overflow-wrap:anywhere;flex:1}button{background:var(--blue);color:white;border:0;border-radius:8px;padding:10px 15px;font-weight:700;cursor:pointer}pre{white-space:pre;overflow:auto;background:#090d11;padding:16px;border-radius:12px;color:#e6edf3}a{color:#79c0ff}.note{border-left:3px solid var(--blue);padding-left:14px}.foot{margin-top:28px;border-top:1px solid var(--border);padding-top:16px}
</style></head><body><main class="card"><div class="badge">✓ X account connected</div><h1>Welcome, ${safeName} (@${safeUsername})</h1>
<p>This is a private API key for your self-hosted tweet.stream server. It is shown here once. Anyone who has it can act through this server as your X account.</p>
<div class="keybox"><code class="key" id="api-key">${safeKey}</code><button id="copy-key" type="button">Copy key</button></div>
<h2>Connect your MCP client</h2><p>Add this to the client’s MCP configuration. Replace the file paths with the absolute paths on this machine.</p>
<pre><code>{
  "mcpServers": {
    "tweet-stream": {
      "url": "${safeBaseUrl}/mcp/sse",
      "headers": { "Authorization": "Bearer ${safeKey}" }
    }
  }
}</code></pre>
<p class="note">Tool calls can publish real posts. Start with <code>get_my_profile</code>; approve each write in your MCP client. X API usage is charged to the X Developer app configured on this server.</p>
<p>If you lose this key, reconnect to generate a replacement. Keep <code>.tokens.json</code> private and never paste the key into a public issue.</p>
<div class="foot">Apache-2.0 core · <a href="https://github.com/ashayas/tweetstream">View source</a></div></main>
<script>
history.replaceState(null,"", "/auth/success");
document.getElementById("copy-key").addEventListener("click",async()=>{const button=document.getElementById("copy-key");try{await navigator.clipboard.writeText(document.getElementById("api-key").textContent);button.textContent="Copied";setTimeout(()=>button.textContent="Copy key",1800)}catch{button.textContent="Select and copy the key"}});
</script></body></html>`;
}
