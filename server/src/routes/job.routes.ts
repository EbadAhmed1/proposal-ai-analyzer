import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getCached, setCached } from '../config/redis';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Cache constants
// ─────────────────────────────────────────────────────────────────────────────

const TRENDS_CACHE_KEY = 'market_trends';
const TRENDS_CACHE_TTL = 60 * 60; // 1 hour in seconds

// ─────────────────────────────────────────────────────────────────────────────
// Data source
//
// Returns the market trend payload.
// ▸ Replace the stub body with real Prisma aggregation in the next sprint:
//
//   const rawSkills = await prisma.jobPosting.findMany({ select: { requiredSkills: true } });
//   const skillCounts = rawSkills
//     .flatMap((jp) => jp.requiredSkills)
//     .reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
//   const topSkills = Object.entries(skillCounts)
//     .sort(([, a], [, b]) => b - a)
//     .slice(0, 5)
//     .map(([skill, jobCount]) => ({ skill, jobCount }));
// ─────────────────────────────────────────────────────────────────────────────

interface SkillTrend {
  skill: string;
  jobCount: number;
  growthPercent: number;
}

interface SourceCount {
  source: string;
  count: number;
}

interface TrendsPayload {
  topSkills: SkillTrend[];
  recentSources: SourceCount[];
}

const fetchTrendsFromSource = async (): Promise<TrendsPayload> => {
  // ── Stub (replace with Prisma aggregation) ─────────────────────────────
  const topSkills: SkillTrend[] = [
    { skill: 'React',      jobCount: 142, growthPercent: 18 },
    { skill: 'Node.js',    jobCount: 118, growthPercent: 12 },
    { skill: 'TypeScript', jobCount:  97, growthPercent: 31 },
    { skill: 'Python',     jobCount:  89, growthPercent:  9 },
    { skill: 'PostgreSQL', jobCount:  74, growthPercent: 22 },
  ];

  const recentSources: SourceCount[] = [
    { source: 'Upwork',     count: 210 },
    { source: 'Freelancer', count: 163 },
    { source: 'Toptal',     count:  82 },
  ];

  return { topSkills, recentSources };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs/trends
//
// Cache-Aside pattern:
//   1. Check Redis for TRENDS_CACHE_KEY.
//   2. Cache HIT  → return cached payload immediately (X-Cache: HIT).
//   3. Cache MISS → fetch from data source, write to Redis (TTL 1 h), return.
//
// Graceful degradation: if Redis is down, getCached/setCached no-op silently
// so the endpoint continues to work — just without caching.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/trends',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {

    // ── 1. Cache look-up ──────────────────────────────────────────────────
    const cached = await getCached<TrendsPayload>(TRENDS_CACHE_KEY);

    if (cached) {
      // Cache HIT — return immediately, no DB/stub call needed.
      res.setHeader('X-Cache', 'HIT');
      return res.json({
        status: 'success',
        meta: {
          dataSource: 'stub',   // swap to 'live' once Prisma aggregation is wired
          cacheStatus: 'hit',
          cachedAt: 'within last 1 hour',
        },
        data: cached,
      });
    }

    // ── 2. Cache MISS — fetch from source ────────────────────────────────
    const payload = await fetchTrendsFromSource();

    // ── 3. Populate cache (fire-and-forget; errors are swallowed inside setCached) ──
    await setCached(TRENDS_CACHE_KEY, payload, TRENDS_CACHE_TTL);

    // ── 4. Respond ────────────────────────────────────────────────────────
    res.setHeader('X-Cache', 'MISS');
    return res.json({
      status: 'success',
      meta: {
        dataSource: 'stub',
        cacheStatus: 'miss',
        cachedUntil: new Date(Date.now() + TRENDS_CACHE_TTL * 1000).toISOString(),
      },
      data: payload,
    });
  })
);

export default router;
