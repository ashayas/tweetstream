import { TwitterApi, ApiResponseError } from 'twitter-api-v2';

export interface PostTweetOptions {
  text: string;
  inReplyToTweetId?: string;
  quoteTweetId?: string;
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
        `Note: Reading tweets / timeline requires an X Developer App with Basic Tier ($100/mo) or higher.\n` +
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
