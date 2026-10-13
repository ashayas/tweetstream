import { TwitterApi, ApiResponseError } from 'twitter-api-v2';

export interface PostTweetOptions {
  text: string;
  inReplyToTweetId?: string;
  quoteTweetId?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function decodeTweetImage(base64: string, mimeType: string): Buffer {
  if (!IMAGE_MIME_TYPES.has(mimeType)) throw new Error('Image type must be PNG, JPEG, or GIF.');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error('Image must be valid standard base64 data.');
  }
  const image = Buffer.from(base64, 'base64');
  if (image.length === 0) throw new Error('Image cannot be empty.');
  if (image.length > MAX_IMAGE_BYTES) throw new Error('Image must be 5 MiB or smaller.');
  const signatures: Record<string, number[]> = {
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/gif': [0x47, 0x49, 0x46, 0x38],
  };
  if (!signatures[mimeType].every((byte, index) => image[index] === byte)) {
    throw new Error('Image data does not match image_mime_type.');
  }
  return image;
}

export interface PostTweetResult {
  id: string;
  text: string;
  url: string;
}

export interface TweetDetails {
  id: string;
  text: string;
  createdAt?: string;
  authorId?: string;
  authorUsername?: string;
  metrics?: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
  };
  url: string;
}

export async function postTweet(
  client: TwitterApi,
  options: PostTweetOptions
): Promise<PostTweetResult> {
  try {
    const payload: Parameters<typeof client.v2.tweet>[0] = {
      text: options.text,
    };

    if (options.imageBase64 || options.imageMimeType) {
      if (!options.imageBase64 || !options.imageMimeType) throw new Error('image_base64 and image_mime_type must be provided together.');
      const image = decodeTweetImage(options.imageBase64, options.imageMimeType);
      const mediaId = await client.v2.uploadMedia(image, { media_type: options.imageMimeType as 'image/png' | 'image/jpeg' | 'image/gif', media_category: 'tweet_image' });
      payload.media = { media_ids: [mediaId] };
    }

    if (options.inReplyToTweetId) {
      payload.reply = {
        in_reply_to_tweet_id: options.inReplyToTweetId,
      };
    }

    if (options.quoteTweetId) {
      payload.quote_tweet_id = options.quoteTweetId;
    }

    const res = await client.v2.tweet(payload);
    
    return {
      id: res.data.id,
      text: res.data.text,
      url: `https://x.com/i/web/status/${res.data.id}`,
    };
  } catch (error) {
    handleTwitterError(error, 'posting tweet');
  }
}

export async function replyToTweet(
  client: TwitterApi,
  tweetId: string,
  text: string
): Promise<PostTweetResult> {
  return await postTweet(client, {
    text,
    inReplyToTweetId: tweetId,
  });
}

export async function getTweet(
  client: TwitterApi,
  tweetId: string
): Promise<TweetDetails> {
  try {
    const res = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      expansions: ['author_id'],
      'user.fields': ['username', 'name'],
    });

    const author = res.includes?.users?.[0];

    return {
      id: res.data.id,
      text: res.data.text,
      createdAt: res.data.created_at,
      authorId: res.data.author_id,
      authorUsername: author?.username,
      metrics: res.data.public_metrics
        ? {
            retweetCount: res.data.public_metrics.retweet_count,
            replyCount: res.data.public_metrics.reply_count,
            likeCount: res.data.public_metrics.like_count,
            quoteCount: res.data.public_metrics.quote_count,
          }
        : undefined,
      url: `https://x.com/i/web/status/${res.data.id}`,
    };
  } catch (error) {
    handleTwitterError(error, `fetching tweet ${tweetId}`);
  }
}

export async function getTimeline(
  client: TwitterApi,
  options: { maxResults?: number; userId?: string } = {}
): Promise<TweetDetails[]> {
  try {
    let targetUserId = options.userId;

    if (!targetUserId) {
      const me = await client.v2.me();
      targetUserId = me.data.id;
    }

    const timeline = await client.v2.userTimeline(targetUserId, {
      max_results: Math.min(Math.max(options.maxResults || 10, 5), 100),
      'tweet.fields': ['created_at', 'public_metrics'],
    });

    const tweets: TweetDetails[] = [];
    for (const t of timeline) {
      tweets.push({
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        metrics: t.public_metrics
          ? {
              retweetCount: t.public_metrics.retweet_count,
              replyCount: t.public_metrics.reply_count,
              likeCount: t.public_metrics.like_count,
              quoteCount: t.public_metrics.quote_count,
            }
          : undefined,
        url: `https://x.com/i/web/status/${t.id}`,
      });
    }

    return tweets;
  } catch (error) {
    handleTwitterError(error, 'fetching user timeline');
  }
}

export async function searchTweets(
  client: TwitterApi,
  query: string,
  maxResults: number = 10
): Promise<TweetDetails[]> {
  try {
    const search = await client.v2.search(query, {
      max_results: Math.min(Math.max(maxResults, 10), 100),
      'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
      expansions: ['author_id'],
      'user.fields': ['username', 'name'],
    });

    const userMap = new Map<string, string>();
    if (search.includes?.users) {
      for (const u of search.includes.users) {
        userMap.set(u.id, u.username);
      }
    }

    const tweets: TweetDetails[] = [];
    for (const t of search) {
      tweets.push({
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        authorId: t.author_id,
        authorUsername: t.author_id ? userMap.get(t.author_id) : undefined,
        metrics: t.public_metrics
          ? {
              retweetCount: t.public_metrics.retweet_count,
              replyCount: t.public_metrics.reply_count,
              likeCount: t.public_metrics.like_count,
              quoteCount: t.public_metrics.quote_count,
            }
          : undefined,
        url: `https://x.com/i/web/status/${t.id}`,
      });
    }

    return tweets;
  } catch (error) {
    handleTwitterError(error, `searching tweets for query "${query}"`);
  }
}

export async function getMe(client: TwitterApi): Promise<{
  id: string;
  name: string;
  username: string;
  description?: string;
  followersCount?: number;
  followingCount?: number;
  tweetCount?: number;
}> {
  try {
    const res = await client.v2.me({
      'user.fields': ['description', 'public_metrics', 'profile_image_url'],
    });

    return {
      id: res.data.id,
      name: res.data.name,
      username: res.data.username,
      description: res.data.description,
      followersCount: res.data.public_metrics?.followers_count,
      followingCount: res.data.public_metrics?.following_count,
      tweetCount: res.data.public_metrics?.tweet_count,
    };
  } catch (error) {
    handleTwitterError(error, 'fetching user profile');
  }
}

function handleTwitterError(error: unknown, actionName: string): never {
  if (error instanceof ApiResponseError) {
    const status = error.code;
    const details = error.data?.detail || error.message;

    if (status === 403) {
      throw new Error(
        `X API Error (${status}) while ${actionName}: Access Forbidden.\n` +
        `Check that your X Developer App has the required endpoint access, permissions, scopes, and available usage credits.\n` +
        `X API response: ${details}`
      );
    }
    if (status === 429) {
      throw new Error(
        `X API Rate Limit Exceeded (${status}) while ${actionName}.\n` +
        `Rate limit reset at: ${new Date(Number(error.rateLimit?.reset) * 1000).toLocaleTimeString()}.\n` +
        `X API response: ${details}`
      );
    }
    if (status === 401) {
      throw new Error(
        `X API Unauthorized (${status}) while ${actionName}. Please check your credentials or re-authenticate.\n` +
        `X API response: ${details}`
      );
    }

    throw new Error(`X API Error (${status}) while ${actionName}: ${details}`);
  }

  throw error as Error;
}
