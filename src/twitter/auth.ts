import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config.js';
import { TokenStore, StoredUserSession } from '../storage/token-store.js';

// In-memory state storage for PKCE flow
interface OAuthStateData {
  codeVerifier: string;
  state: string;
  createdAt: number;
}

const stateStore = new Map<string, OAuthStateData>();

// Clean up expired states every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of stateStore.entries()) {
    if (now - data.createdAt > 15 * 60 * 1000) {
      stateStore.delete(key);
    }
  }
}, 15 * 60 * 1000);

export function getOAuthClient(): TwitterApi {
  if (!config.xClientId) {
    throw new Error('X_CLIENT_ID is not configured. Please set X_CLIENT_ID in your .env file.');
  }
  return new TwitterApi({
    clientId: config.xClientId,
    clientSecret: config.xClientSecret,
  });
}

export function generateAuthLink(redirectUri?: string): { url: string; state: string } {
  const client = getOAuthClient();
  const uri = redirectUri || config.xRedirectUri;

  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(uri, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
  });

  stateStore.set(state, {
    codeVerifier,
    state,
    createdAt: Date.now(),
  });

  return { url, state };
}

export async function handleOAuthCallback(
  code: string,
  state: string,
  redirectUri?: string
): Promise<{ session: StoredUserSession; client: TwitterApi }> {
  const stateData = stateStore.get(state);
  if (!stateData) {
    throw new Error('Invalid or expired OAuth state parameter.');
  }

  // Clean up state
  stateStore.delete(state);

  const client = getOAuthClient();
  const uri = redirectUri || config.xRedirectUri;

  const { client: userClient, accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
    code,
    codeVerifier: stateData.codeVerifier,
    redirectUri: uri,
  });

  // Fetch the logged-in user profile
  const user = await userClient.v2.me();

  const tokenStore = TokenStore.getInstance();
  const session = tokenStore.saveSession({
    userId: user.data.id,
    username: user.data.username,
    name: user.data.name,
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  });

  return { session, client: userClient };
}
