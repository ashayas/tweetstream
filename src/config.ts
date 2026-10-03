import dotenv from 'dotenv';
import path from 'path';

// Load .env from current directory or parent directory
dotenv.config();

export interface Config {
  port: number;
  host: string;
  baseUrl: string;
  
  // OAuth 2.0 PKCE App Credentials
  xClientId?: string;
  xClientSecret?: string;
  xRedirectUri: string;
  
  // BYOK Credentials (OAuth 1.0a)
  xApiKey?: string;
  xApiSecret?: string;
  xAccessToken?: string;
  xAccessTokenSecret?: string;
  
  // BYOK OAuth 2.0 User Access Token
  xUserAccessToken?: string;
  
  // tweet.stream token
  tweetStreamApiKey?: string;
  
  // Token store path
  tokenStorePath: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3030', 10),
  host: process.env.HOST || '0.0.0.0',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3030'}`,
  
  xClientId: process.env.X_CLIENT_ID,
  xClientSecret: process.env.X_CLIENT_SECRET,
  xRedirectUri: process.env.X_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3030'}/auth/callback`,
  
  xApiKey: process.env.X_API_KEY,
  xApiSecret: process.env.X_API_SECRET,
  xAccessToken: process.env.X_ACCESS_TOKEN,
  xAccessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  
  xUserAccessToken: process.env.X_USER_ACCESS_TOKEN,
  
  tweetStreamApiKey: process.env.TWEET_STREAM_API_KEY,
  
  tokenStorePath: process.env.TOKEN_STORE_PATH || path.join(process.cwd(), '.tokens.json'),
};

export function hasByokCredentials(): boolean {
  return (
    !!(config.xApiKey && config.xApiSecret && config.xAccessToken && config.xAccessTokenSecret) ||
    !!config.xUserAccessToken
  );
}

export function hasOAuthAppCredentials(): boolean {
  return !!(config.xClientId && config.xClientSecret);
}
