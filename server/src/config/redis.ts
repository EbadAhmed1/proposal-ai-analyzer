import Redis from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Redis client (singleton)
//
// Uses the REDIS_URL env var so the same code works against:
//   - Local dev:      redis://localhost:6379
//   - Managed Redis:  rediss://:<password>@<host>:6380  (TLS)
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  // Retry with exponential back-off up to ~30 s, then give up.
  // Returning null stops retrying and emits an 'error' event instead of
  // crashing the process, so the app can continue running without Redis.
  retryStrategy: (times: number) => {
    if (times > 5) {
      console.error(`[Redis] Connection failed after ${times} attempts — stopping retries`);
      return null; // stop retrying
    }
    const delay = Math.min(times * 200, 3000); // 200 ms … 3 s
    console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },

  // Don't block the event loop waiting for commands while reconnecting;
  // instead, fail fast so callers can gracefully degrade.
  maxRetriesPerRequest: 1,

  // Keeps the TCP connection alive to avoid silent timeouts from load balancers.
  keepAlive: 10_000,

  // Required for TLS connections (e.g. Redis Cloud, Upstash with rediss://)
  // ioredis automatically enables TLS when the URL scheme is "rediss://".
  enableReadyCheck: true,
});

// ── Lifecycle events ──────────────────────────────────────────────────────────

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  console.log('✅ Redis ready to accept commands');
});

redis.on('error', (err: Error) => {
  // Log but do NOT throw — the app must keep running if Redis is unavailable.
  console.error('[Redis] Error:', err.message);
});

redis.on('close', () => {
  console.warn('[Redis] Connection closed');
});

redis.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting…');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the Redis client is currently connected and ready.
 * Use this guard in middleware to decide whether to attempt a Redis operation.
 */
export const isRedisReady = (): boolean => redis.status === 'ready';

/**
 * Safely GET a cached JSON value.
 * Returns null if Redis is unavailable or the key doesn't exist.
 */
export const getCached = async <T>(key: string): Promise<T | null> => {
  if (!isRedisReady()) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error(`[Redis] getCached error for key "${key}":`, (err as Error).message);
    return null;
  }
};

/**
 * Safely SET a JSON value with a TTL (in seconds).
 * Silently no-ops if Redis is unavailable.
 */
export const setCached = async (
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> => {
  if (!isRedisReady()) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error(`[Redis] setCached error for key "${key}":`, (err as Error).message);
  }
};

/**
 * Invalidate (delete) one or more cache keys.
 */
export const invalidateCache = async (...keys: string[]): Promise<void> => {
  if (!isRedisReady() || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    console.error('[Redis] invalidateCache error:', (err as Error).message);
  }
};
