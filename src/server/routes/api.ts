import { Router, Request, Response } from 'express';
import { getTwitterClient } from '../../twitter/client.js';
import {
  postTweet,
  decodeTweetImage,
  replyToTweet,
  getTweet,
  getTimeline,
  searchTweets,
  getMe,
} from '../../twitter/actions.js';

export const apiRouter = Router();

// Helper to extract API key from request
function extractApiKey(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey) {
    return xApiKey.trim();
  }
  return undefined;
}

// 1. Post a new tweet
apiRouter.post('/tweet', async (req: Request, res: Response) => {
  try {
    const apiKey = extractApiKey(req);
    const { client } = await getTwitterClient(apiKey);
    const { text, quoteTweetId, imageBase64, imageMimeType } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Field "text" is required.' });
      return;
    }

    if (text.length > 280) {
      res.status(400).json({ error: `Text exceeds 280 characters (${text.length}).` });
      return;
    }

    if (Boolean(imageBase64) !== Boolean(imageMimeType)) {
      res.status(400).json({ error: 'Fields "imageBase64" and "imageMimeType" must be provided together.' });
      return;
    }
    if (imageBase64 && imageMimeType) {
      try {
        decodeTweetImage(String(imageBase64), String(imageMimeType));
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
        return;
      }
    }

    const result = await postTweet(client, {
      text,
      quoteTweetId: quoteTweetId ? String(quoteTweetId) : undefined,
      imageBase64: imageBase64 ? String(imageBase64) : undefined,
      imageMimeType: imageMimeType ? String(imageMimeType) : undefined,
    });

    res.json({ success: true, tweet: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 2. Reply to an existing tweet
apiRouter.post('/reply', async (req: Request, res: Response) => {
  try {
    const apiKey = extractApiKey(req);
    const { client } = await getTwitterClient(apiKey);
    const { tweetId, text } = req.body;

    if (!tweetId || !text) {
      res.status(400).json({ error: 'Fields "tweetId" and "text" are required.' });
      return;
    }

    const result = await replyToTweet(client, String(tweetId), String(text));
    res.json({ success: true, reply: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 3. Get single tweet details
apiRouter.get('/tweet/:id', async (req: Request, res: Response) => {
  try {
    const apiKey = extractApiKey(req);
    const { client } = await getTwitterClient(apiKey);
    const tweetId = String(req.params.id);
    const tweet = await getTweet(client, tweetId);

    res.json({ success: true, tweet });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 4. Get authenticated user timeline
apiRouter.get('/timeline', async (req: Request, res: Response) => {
  try {
    const apiKey = extractApiKey(req);
    const { client } = await getTwitterClient(apiKey);
    const limit = req.query.limit ? Number(req.query.limit) : 10;

    const tweets = await getTimeline(client, { maxResults: limit });
    res.json({ success: true, count: tweets.length, tweets });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 5. Search recent tweets
apiRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const apiKey = extractApiKey(req);
    const { client } = await getTwitterClient(apiKey);
    const query = req.query.q as string;
    const limit = req.query.limit ? Number(req.query.limit) : 10;

    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required.' });
      return;
    }

    const tweets = await searchTweets(client, query, limit);
    res.json({ success: true, count: tweets.length, tweets });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 6. Get profile info
apiRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const apiKey = extractApiKey(req);
    const { client, user, authType } = await getTwitterClient(apiKey);
    const profile = await getMe(client);

    res.json({
      success: true,
      profile,
      session: user,
      authType,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});
