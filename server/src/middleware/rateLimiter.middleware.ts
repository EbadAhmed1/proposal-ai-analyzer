import rateLimit, { Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Request } from 'express';
import { redis, isRedisReady } from '../config/redis';

// ─────────────────────────────────────────────────────────────────────────────
// Proposal Generation Rate Limiter
//
// Strategy  : Per userId (not per IP).
//             This is intentional — the same user on different IPs or behind
//             a NAT/proxy still counts against their personal quota.
//
// Quota     : 10 proposals per 24-hour sliding window.
//
// Fallback  : If Redis is unavailable the limiter degrades gracefully —
//             it skips rate limiting for that request rather than blocking
//             legitimate users. A warning is logged.
//
// Usage     : Apply this middleware to any route that triggers proposal generation.
//             The route MUST be behind the `authenticate` middleware so that
//             req.userId is populated before this middleware runs.
//
//   router.post('/generate', authenticate, proposalRateLimiter, handler);
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS  = 24 * 60 * 60 * 1000; // 24 hours
const MAX_HITS   = 10;
const KEY_PREFIX = 'rl:proposal:';

/**
 * Builds a Redis-backed rate limiter store. Falls back to the in-memory store
 * (via returning undefined) when Redis is not connected.
 */
const buildStore = (): Options['store'] | undefined => {
  if (!isRedisReady()) {
    console.warn('[RateLimit] Redis not ready — falling back to in-memory store');
    return undefined; // express-rate-limit uses its built-in MemoryStore
  }

  return new RedisStore({
    // Bridge ioredis's .call() to rate-limit-redis's sendCommand interface.
    // ioredis.call() signature: (command: string, ...args) => Promise<unknown>
    sendCommand: (...args: string[]) =>
      redis.call(...(args as [string, ...string[]])) as Promise<number>,

    prefix: KEY_PREFIX,
  });
};

export const proposalRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_HITS,

  // ── Key: rate-limit per authenticated userId, not per IP ──────────────────
  keyGenerator: (req: Request): string => {
    const userId = req.userId;
    if (!userId) {
      // Defensive: should not happen if authenticate middleware ran first.
      // Fall back to IP so the limiter still works rather than throwing.
      console.warn('[RateLimit] req.userId is undefined — falling back to IP key');
      return req.ip ?? 'unknown';
    }
    return userId;
  },

  // ── Store ─────────────────────────────────────────────────────────────────
  store: buildStore(),

  // ── Skip conditions ───────────────────────────────────────────────────────
  // If Redis went down mid-request we skip (fail open) to avoid blocking users.
  skip: (_req: Request) => {
    if (!isRedisReady()) {
      console.warn('[RateLimit] Redis unavailable — skipping rate limit check for this request');
      return true; // skip = do not count / do not block
    }
    return false;
  },

  // ── Response when limit is exceeded ──────────────────────────────────────
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message:
        'Proposal generation limit reached. You can generate up to 10 proposals per 24 hours.',
      retryAfter: '24 hours',
    });
  },

  // ── Headers ───────────────────────────────────────────────────────────────
  // Sends standard RateLimit-* headers (RFC 6585 draft) so clients can display
  // quota info, and omits the older X-RateLimit-* headers.
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// General-purpose API rate limiter (IP-based, lenient)
//
// Applied globally to all /api/* routes to guard against abuse / DoS.
// Much more generous limits than the proposal limiter.
// ─────────────────────────────────────────────────────────────────────────────

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 200,                  // 200 requests per window per IP

  store: buildStore(),

  keyGenerator: (req: Request) => req.ip ?? 'unknown',

  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP. Please slow down.',
    });
  },

  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
