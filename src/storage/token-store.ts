import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config.js';

export interface StoredUserSession {
  apiKey: string;           // ts_live_...
  userId: string;           // Twitter User ID
  username: string;         // @handle
  name: string;             // Display Name
  accessToken: string;      // OAuth 2.0 access token
  refreshToken?: string;    // OAuth 2.0 refresh token
  expiresAt?: number;       // Timestamp when accessToken expires
  createdAt: number;
}

export class TokenStore {
  private static instance: TokenStore;
  private filePath: string;
  private sessions: Map<string, StoredUserSession> = new Map();

  private constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  public static getInstance(): TokenStore {
    if (!TokenStore.instance) {
      TokenStore.instance = new TokenStore(config.tokenStorePath);
    }
    return TokenStore.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: Record<string, StoredUserSession> = JSON.parse(data);
        for (const [key, session] of Object.entries(parsed)) {
          this.sessions.set(key, session);
        }
      }
    } catch (err) {
      console.warn(`[TokenStore] Could not load tokens from ${this.filePath}:`, (err as Error).message);
    }
  }

  private save(): void {
    try {
      const obj: Record<string, StoredUserSession> = {};
      for (const [key, session] of this.sessions.entries()) {
        obj[key] = session;
      }
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
      // This file contains bearer credentials. Restrict it to the service account on POSIX hosts.
      if (process.platform !== 'win32') fs.chmodSync(this.filePath, 0o600);
    } catch (err) {
      console.error(`[TokenStore] Failed to save tokens to ${this.filePath}:`, (err as Error).message);
    }
  }

  public generateApiKey(): string {
    return `ts_live_${crypto.randomBytes(24).toString('hex')}`;
  }

  public saveSession(session: Omit<StoredUserSession, 'apiKey' | 'createdAt'> & { apiKey?: string }): StoredUserSession {
    const apiKey = session.apiKey || this.generateApiKey();
    const stored: StoredUserSession = {
      ...session,
      apiKey,
      createdAt: Date.now(),
    };

    // If this user already has an existing session, we can reuse or update
    for (const [existingKey, s] of this.sessions.entries()) {
      if (s.userId === session.userId) {
        this.sessions.delete(existingKey);
      }
    }

    this.sessions.set(apiKey, stored);
    this.save();
    return stored;
  }

  public getSession(apiKey: string): StoredUserSession | undefined {
    return this.sessions.get(apiKey);
  }

  public updateTokens(apiKey: string, accessToken: string, refreshToken?: string, expiresIn?: number): void {
    const session = this.sessions.get(apiKey);
    if (!session) return;

    session.accessToken = accessToken;
    if (refreshToken) session.refreshToken = refreshToken;
    if (expiresIn) session.expiresAt = Date.now() + expiresIn * 1000;

    this.sessions.set(apiKey, session);
    this.save();
  }

  public getAllSessions(): StoredUserSession[] {
    return Array.from(this.sessions.values());
  }

  public getLatestSession(): StoredUserSession | undefined {
    const all = this.getAllSessions();
    if (all.length === 0) return undefined;
    return all.sort((a, b) => b.createdAt - a.createdAt)[0];
  }
}
