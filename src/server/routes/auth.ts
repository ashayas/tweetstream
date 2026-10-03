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
    res.redirect(`/auth/success?key=${encodeURIComponent(session.apiKey)}&user=${encodeURIComponent(session.username)}&name=${encodeURIComponent(session.name)}`);
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

// 3. Success page showing the user's generated API key
authRouter.get('/success', (req: Request, res: Response) => {
  const apiKey = req.query.key as string;
  const user = req.query.user as string;
  const name = req.query.name as string;

  if (!apiKey) {
    res.redirect('/');
    return;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Connected to tweet.stream!</title>
      <style>
        :root {
          --bg: #0f1419;
          --card: #192734;
          --border: #38444d;
          --text: #f7f9f9;
          --text-muted: #8b98a5;
          --primary: #1d9bf0;
          --success: #00ba7c;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: var(--bg);
          color: var(--text);
          margin: 0;
          padding: 40px 20px;
          display: flex;
          justify-content: center;
        }
        .container {
          max-width: 650px;
          width: 100%;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 36px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .badge {
          display: inline-block;
          background: rgba(0, 186, 124, 0.15);
          color: var(--success);
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 14px;
          margin-bottom: 16px;
        }
        h1 { margin: 0 0 8px 0; font-size: 26px; }
        p { color: var(--text-muted); line-height: 1.6; margin-top: 0; }
        .key-box {
          background: #000;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 24px 0;
        }
        .key-text {
          font-family: monospace;
          color: #79c0ff;
          font-size: 15px;
          word-break: break-all;
        }
        button.copy-btn {
          background: var(--primary);
          color: #fff;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          margin-left: 12px;
          white-space: nowrap;
          transition: background 0.2s;
        }
        button.copy-btn:hover { background: #1a8cd8; }
        pre {
          background: #111;
          padding: 16px;
          border-radius: 10px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
          color: #e6edf3;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid var(--border);
          padding-top: 16px;
          font-size: 13px;
          color: var(--text-muted);
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="badge">✓ Successfully Connected</div>
        <h1>Welcome, ${name} (@${user})!</h1>
        <p>Your X account is linked to <strong>tweet.stream</strong>. Use your unique API Key below to let any MCP client or script tweet on your behalf.</p>

        <label style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Your tweet.stream API Key</label>
        <div class="key-box">
          <span class="key-text" id="api-key">${apiKey}</span>
          <button class="copy-btn" onclick="copyKey()">Copy Key</button>
        </div>

        <h3 style="margin-top: 28px; margin-bottom: 12px;">Claude Desktop / Cursor Configuration</h3>
        <p>Add this to your <code>claude_desktop_config.json</code>:</p>
        <pre><code>{
  "mcpServers": {
    "tweet-stream": {
      "command": "npx",
      "args": ["-y", "tweet-stream"],
      "env": {
        "TWEET_STREAM_API_KEY": "${apiKey}"
      }
    }
  }
}</code></pre>

        <h3 style="margin-top: 24px; margin-bottom: 12px;">Direct REST API Example</h3>
        <pre><code>curl -X POST ${config.baseUrl}/api/v1/tweet \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Hello world from tweet.stream!"}'</code></pre>

        <div class="footer">
          Powered by <strong>Vartabase AI</strong> • Open Source on <a href="https://github.com" style="color: var(--primary);">GitHub</a>
        </div>
      </div>

      <script>
        function copyKey() {
          const key = document.getElementById('api-key').innerText;
          navigator.clipboard.writeText(key).then(() => {
            const btn = document.querySelector('.copy-btn');
            btn.innerText = 'Copied!';
            setTimeout(() => { btn.innerText = 'Copy Key'; }, 2000);
          });
        }
      </script>
    </body>
    </html>
  `);
});
