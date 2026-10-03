import { TwitterApi } from 'twitter-api-v2';
import { config, hasByokCredentials } from '../config.js';
import { TokenStore, StoredUserSession } from '../storage/token-store.js';

export interface ClientContext {
  client: TwitterApi;
  user?: {
    id: string;
    username: string;
    name: string;
  };
  authType: 'oauth2_token' | 'byok_oauth1' | 'byok_oauth2' | 'app_bearer';
}

export async function getTwitterClient(apiKeyOverride?: string): Promise<ClientContext> {
  const tokenStore = TokenStore.getInstance();
  const targetKey = apiKeyOverride || config.tweetStreamApiKey;

  // 1. Try tweet.stream API Key from TokenStore
  if (targetKey) {
    const session = tokenStore.getSession(targetKey);
    if (session) {
      return await buildClientFromSession(session);
    }
  }

  // 2. If no explicit key provided, check if we have any stored local session
  const latestSession = tokenStore.getLatestSession();
  if (latestSession && !hasByokCredentials()) {
    return await buildClientFromSession(latestSession);
  }

  // 3. BYOK: Direct OAuth 2.0 User Access Token
  if (config.xUserAccessToken) {
    const client = new TwitterApi(config.xUserAccessToken);
    return {
      client,
      authType: 'byok_oauth2',
    };
  }

  // 4. BYOK: OAuth 1.0a User Credentials (API Key/Secret + Access Token/Secret)
  if (config.xApiKey && config.xApiSecret && config.xAccessToken && config.xAccessTokenSecret) {
    const client = new TwitterApi({
      appKey: config.xApiKey,
      appSecret: config.xApiSecret,
      accessToken: config.xAccessToken,
      accessSecret: config.xAccessTokenSecret,
    });
    return {
      client,
      authType: 'byok_oauth1',
    };
  }

  throw new Error(
    'No Twitter credentials found!\n' +
    'Please authenticate by:\n' +
    '  1. Visiting tweet.stream (or running the local server) and connecting your X account, OR\n' +
    '  2. Providing TWEET_STREAM_API_KEY in your environment, OR\n' +
    '  3. Providing X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (BYOK) in your environment.'
  );
}

async function buildClientFromSession(session: StoredUserSession): Promise<ClientContext> {
  const tokenStore = TokenStore.getInstance();
  let accessToken = session.accessToken;

  // Check if token is expired or close to expiring (within 2 minutes)
  const isExpired = session.expiresAt && Date.now() > session.expiresAt - 120 * 1000;

  if (isExpired && session.refreshToken && config.xClientId) {
    try {
      const basicClient = new TwitterApi({
        clientId: config.xClientId,
        clientSecret: config.xClientSecret,
      });

      const { accessToken: newAccess, refreshToken: newRefresh, expiresIn } =
        await basicClient.refreshOAuth2Token(session.refreshToken);

      accessToken = newAccess;
      tokenStore.updateTokens(session.apiKey, newAccess, newRefresh, expiresIn);
    } catch (err) {
      console.warn(`[TwitterClient] Failed to refresh OAuth token for @${session.username}:`, (err as Error).message);
    }
  }

  const client = new TwitterApi(accessToken);
  return {
    client,
    user: {
      id: session.userId,
      username: session.username,
      name: session.name,
    },
    authType: 'oauth2_token',
  };
}
