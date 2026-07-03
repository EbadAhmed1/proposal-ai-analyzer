import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getCached, setCached } from '../config/redis';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI client (reused for trends generation)
// ─────────────────────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache constants
// ─────────────────────────────────────────────────────────────────────────────

const TRENDS_CACHE_KEY = 'market_trends_v2';
const TRENDS_CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DomainTrend {
  domain: string;
  demandScore: number;
  growthPercent: number;
  icon: string;
  topStacks: string[];
  hotProjects: string[];
}

interface TrendsPayload {
  domains: DomainTrend[];
  lastUpdated: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback data (used when OpenAI is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_TRENDS: TrendsPayload = {
  domains: [
    {
      domain: 'AI & Machine Learning',
      demandScore: 95,
      growthPercent: 42,
      icon: '🧠',
      topStacks: ['Python', 'TensorFlow', 'PyTorch', 'LangChain', 'Hugging Face'],
      hotProjects: ['Generative AI Apps', 'RAG Pipelines', 'Computer Vision', 'AI Chatbots'],
    },
    {
      domain: 'Cloud & DevOps',
      demandScore: 88,
      growthPercent: 28,
      icon: '☁️',
      topStacks: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'GitHub Actions'],
      hotProjects: ['Cloud Migration', 'CI/CD Pipelines', 'Infrastructure as Code', 'Serverless Architecture'],
    },
    {
      domain: 'Cybersecurity',
      demandScore: 82,
      growthPercent: 35,
      icon: '🔒',
      topStacks: ['Zero Trust', 'SIEM', 'Penetration Testing', 'Burp Suite', 'Wireshark'],
      hotProjects: ['Cloud Security Audits', 'Threat Detection', 'Compliance Automation', 'SOC Setup'],
    },
    {
      domain: 'Web & Mobile Development',
      demandScore: 90,
      growthPercent: 15,
      icon: '🌐',
      topStacks: ['React', 'Next.js', 'React Native', 'Flutter', 'TypeScript'],
      hotProjects: ['SaaS Dashboards', 'E-commerce Platforms', 'Cross-platform Apps', 'Progressive Web Apps'],
    },
    {
      domain: 'Data Engineering',
      demandScore: 78,
      growthPercent: 31,
      icon: '📊',
      topStacks: ['Apache Spark', 'Kafka', 'dbt', 'Snowflake', 'Airflow'],
      hotProjects: ['Real-time Data Pipelines', 'Data Warehousing', 'ETL Automation', 'Analytics Dashboards'],
    },
    {
      domain: 'Blockchain & Web3',
      demandScore: 62,
      growthPercent: 18,
      icon: '⛓️',
      topStacks: ['Solidity', 'Rust', 'Ethers.js', 'Hardhat', 'Anchor'],
      hotProjects: ['Smart Contracts', 'DeFi Protocols', 'NFT Marketplaces', 'DAO Tooling'],
    },
  ],
  lastUpdated: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-powered live trends generation
// ─────────────────────────────────────────────────────────────────────────────

const TRENDS_SYSTEM_PROMPT = `\
You are a senior tech industry analyst. Return ONLY valid JSON (no markdown fences, no explanation) matching this exact schema:

{
  "domains": [
    {
      "domain": "string — domain name, e.g. AI & Machine Learning",
      "demandScore": "number 0-100 — relative freelance demand index",
      "growthPercent": "number — estimated YoY growth percentage",
      "icon": "string — single emoji representing the domain",
      "topStacks": ["string — 5 most in-demand technologies/frameworks"],
      "hotProjects": ["string — 4 most common freelance project types"]
    }
  ]
}

Cover exactly these 6 domains:
1. AI & Machine Learning
2. Cloud & DevOps
3. Web & Mobile Development
4. Cybersecurity
5. Data Engineering
6. Blockchain & Web3

Base your analysis on current 2025-2026 freelance market trends. Be specific with technology names. Order domains by demandScore descending.`;

async function fetchLiveTrends(): Promise<TrendsPayload> {
  try {
    console.log('[Trends] Fetching live market trends from OpenAI…');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: TRENDS_SYSTEM_PROMPT },
        { role: 'user', content: 'Generate current freelance tech market trends for 2025-2026. Return JSON only.' },
      ],
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error('OpenAI returned empty response for trends');
    }

    const parsed = JSON.parse(raw) as { domains: DomainTrend[] };

    if (!Array.isArray(parsed.domains) || parsed.domains.length === 0) {
      throw new Error('Invalid trends structure from OpenAI');
    }

    const tokensUsed = completion.usage?.total_tokens ?? 0;
    console.log(`[Trends] ✅ Live trends received (${tokensUsed} tokens, ${parsed.domains.length} domains)`);

    return {
      domains: parsed.domains,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Trends] Failed to fetch live trends:', (err as Error).message);
    console.warn('[Trends] Using fallback data');
    return {
      ...FALLBACK_TRENDS,
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs/trends
//
// Cache-Aside pattern:
//   1. Check Redis for TRENDS_CACHE_KEY.
//   2. Cache HIT  → return cached payload immediately (X-Cache: HIT).
//   3. Cache MISS → fetch live trends from OpenAI, write to Redis (TTL 24h), return.
//
// Graceful degradation: if Redis is down, getCached/setCached no-op silently
// so the endpoint continues to work — just without caching.
// If OpenAI is down, falls back to curated stub data.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/trends',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {

    // ── 1. Cache look-up ──────────────────────────────────────────────────
    const cached = await getCached<TrendsPayload>(TRENDS_CACHE_KEY);

    if (cached) {
      // Cache HIT — return immediately, no OpenAI call needed.
      res.setHeader('X-Cache', 'HIT');
      return res.json({
        status: 'success',
        meta: {
          dataSource: 'live',
          cacheStatus: 'hit',
          lastUpdated: cached.lastUpdated,
        },
        data: cached,
      });
    }

    // ── 2. Cache MISS — fetch live trends ────────────────────────────────
    const payload = await fetchLiveTrends();

    // ── 3. Populate cache (fire-and-forget; errors are swallowed inside setCached) ──
    await setCached(TRENDS_CACHE_KEY, payload, TRENDS_CACHE_TTL);

    // ── 4. Respond ────────────────────────────────────────────────────────
    res.setHeader('X-Cache', 'MISS');
    return res.json({
      status: 'success',
      meta: {
        dataSource: 'live',
        cacheStatus: 'miss',
        lastUpdated: payload.lastUpdated,
        cachedUntil: new Date(Date.now() + TRENDS_CACHE_TTL * 1000).toISOString(),
      },
      data: payload,
    });
  })
);

export default router;
