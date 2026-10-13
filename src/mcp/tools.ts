import { getTwitterClient } from '../twitter/client.js';
import {
  postTweet,
  replyToTweet,
  getTweet,
  getTimeline,
  searchTweets,
  getMe,
} from '../twitter/actions.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'post_tweet',
    description: 'Post a text or image update to X from the authenticated account. Image posts accept a base64 PNG, JPEG, or GIF up to 5 MiB.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The tweet content text (up to 280 characters).',
        },
        quote_tweet_id: {
          type: 'string',
          description: 'Optional ID of an existing tweet to quote-tweet.',
        },
        image_base64: {
          type: 'string',
          description: 'Optional standard base64-encoded PNG, JPEG, or GIF image (up to 5 MiB decoded). Provide with image_mime_type.',
        },
        image_mime_type: {
          type: 'string',
          enum: ['image/png', 'image/jpeg', 'image/gif'],
          description: 'MIME type of image_base64.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'reply_to_tweet',
    description: 'Reply directly to an existing tweet thread on X/Twitter.',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_id: {
          type: 'string',
          description: 'The ID of the tweet you are replying to.',
        },
        text: {
          type: 'string',
          description: 'The reply text (up to 280 characters).',
        },
      },
      required: ['tweet_id', 'text'],
    },
  },
  {
    name: 'get_tweet',
    description: 'Fetch details, text, author, and engagement metrics of a specific tweet by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_id: {
          type: 'string',
          description: 'The ID of the tweet to retrieve.',
        },
      },
      required: ['tweet_id'],
    },
  },
  {
    name: 'read_timeline',
    description: 'Read recent posts from the authenticated user timeline. X API access and usage charges apply.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent tweets to retrieve (between 5 and 50, default is 10).',
        },
      },
    },
  },
  {
    name: 'search_tweets',
    description: 'Search recent posts across X matching a query. X API access and usage charges apply.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or hashtag (e.g., "#ai", "mcp protocol").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (between 10 and 50, default 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_my_profile',
    description: 'Get details about the currently authenticated X/Twitter account (handle, name, bio, follower count).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleToolCall(
  name: string,
  args: Record<string, unknown> = {},
  apiKeyOverride?: string
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    // 1. Perform early argument validations
    if (name === 'post_tweet') {
      const text = String(args.text || '').trim();
      if (!text) {
        return {
          content: [{ type: 'text', text: 'Error: Tweet text cannot be empty.' }],
          isError: true,
        };
      }
      if (text.length > 280) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tweet text exceeds 280 characters (${text.length} characters). Please shorten it.`,
            },
          ],
          isError: true,
        };
      }
    } else if (name === 'reply_to_tweet') {
      const tweetId = String(args.tweet_id || '').trim();
      const text = String(args.text || '').trim();
      if (!tweetId) {
        return {
          content: [{ type: 'text', text: 'Error: tweet_id is required to reply.' }],
          isError: true,
        };
      }
      if (!text) {
        return {
          content: [{ type: 'text', text: 'Error: Reply text cannot be empty.' }],
          isError: true,
        };
      }
    } else if (name === 'get_tweet') {
      const tweetId = String(args.tweet_id || '').trim();
      if (!tweetId) {
        return {
          content: [{ type: 'text', text: 'Error: tweet_id is required.' }],
          isError: true,
        };
      }
    } else if (name === 'search_tweets') {
      const query = String(args.query || '').trim();
      if (!query) {
        return {
          content: [{ type: 'text', text: 'Error: Search query is required.' }],
          isError: true,
        };
      }
    }

    // 2. Resolve authenticated Twitter client
    const { client, user, authType } = await getTwitterClient(apiKeyOverride);

    switch (name) {
      case 'post_tweet': {
        const text = String(args.text || '').trim();
        const quoteTweetId = args.quote_tweet_id ? String(args.quote_tweet_id) : undefined;
        const imageBase64 = args.image_base64 ? String(args.image_base64) : undefined;
        const imageMimeType = args.image_mime_type ? String(args.image_mime_type) : undefined;
        const result = await postTweet(client, { text, quoteTweetId, imageBase64, imageMimeType });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Tweet posted successfully!\n\nID: ${result.id}\nURL: ${result.url}\nText: "${result.text}"`,
            },
          ],
        };
      }

      case 'reply_to_tweet': {
        const tweetId = String(args.tweet_id || '').trim();
        const text = String(args.text || '').trim();
        const result = await replyToTweet(client, tweetId, text);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Reply posted successfully!\n\nReply ID: ${result.id}\nReplying to: https://x.com/i/web/status/${tweetId}\nURL: ${result.url}\nText: "${result.text}"`,
            },
          ],
        };
      }

      case 'get_tweet': {
        const tweetId = String(args.tweet_id || '').trim();
        if (!tweetId) {
          return {
            content: [{ type: 'text', text: 'Error: tweet_id is required.' }],
            isError: true,
          };
        }

        const tweet = await getTweet(client, tweetId);
        const metricsStr = tweet.metrics
          ? `❤️ Likes: ${tweet.metrics.likeCount} | 🔁 Retweets: ${tweet.metrics.retweetCount} | 💬 Replies: ${tweet.metrics.replyCount}`
          : 'Metrics not available';

        return {
          content: [
            {
              type: 'text',
              text: `Tweet from @${tweet.authorUsername || 'unknown'}:\n"${tweet.text}"\n\n${metricsStr}\nPosted: ${tweet.createdAt || 'N/A'}\nURL: ${tweet.url}`,
            },
          ],
        };
      }

      case 'read_timeline': {
        const limit = args.limit ? Number(args.limit) : 10;
        const tweets = await getTimeline(client, { maxResults: limit });

        if (tweets.length === 0) {
          return {
            content: [{ type: 'text', text: 'No tweets found in timeline.' }],
          };
        }

        const formatted = tweets
          .map(
            (t, i) =>
              `${i + 1}. [${t.createdAt ? new Date(t.createdAt).toLocaleString() : 'Recent'}] (ID: ${t.id})\n"${t.text}"\n${t.url}`
          )
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Retrieved ${tweets.length} recent tweet(s):\n\n${formatted}`,
            },
          ],
        };
      }

      case 'search_tweets': {
        const query = String(args.query || '').trim();
        if (!query) {
          return {
            content: [{ type: 'text', text: 'Error: Search query is required.' }],
            isError: true,
          };
        }
        const limit = args.limit ? Number(args.limit) : 10;
        const tweets = await searchTweets(client, query, limit);

        if (tweets.length === 0) {
          return {
            content: [{ type: 'text', text: `No tweets found matching "${query}".` }],
          };
        }

        const formatted = tweets
          .map(
            (t, i) =>
              `${i + 1}. @${t.authorUsername || 'user'}: "${t.text}"\nURL: ${t.url}`
          )
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${tweets.length} tweet(s) for "${query}":\n\n${formatted}`,
            },
          ],
        };
      }

      case 'get_my_profile': {
        const profile = await getMe(client);
        return {
          content: [
            {
              type: 'text',
              text: `Authenticated Account Profile:\n\nName: ${profile.name} (@${profile.username})\nUser ID: ${profile.id}\nBio: ${profile.description || '(no bio)'}\nFollowers: ${profile.followersCount ?? 'N/A'} | Following: ${profile.followingCount ?? 'N/A'}\nTotal Tweets: ${profile.tweetCount ?? 'N/A'}\nAuth Mode: ${authType}${user ? ` (Logged in as @${user.username})` : ''}`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: (error as Error).message || 'An unknown error occurred.' }],
      isError: true,
    };
  }
}
