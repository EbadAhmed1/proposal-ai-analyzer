import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load env vars FIRST — before any module that reads process.env
dotenv.config();

import { prisma } from './lib/prisma';
import { redis } from './config/redis';
import { AppError } from './utils/AppError';
import { asyncHandler } from './utils/asyncHandler';
import { apiRateLimiter } from './middleware/rateLimiter.middleware';

// ── Routes ──────────────────────────────────────────────────────────────────
import authRoutes     from './routes/auth.routes';
import userRoutes     from './routes/user.routes';
import jobRoutes      from './routes/job.routes';
import proposalRoutes from './routes/proposal.routes';
import { closeRabbitMQ } from './config/rabbitmq';

// ─────────────────────────────────────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// ── Core middleware ──────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Public system routes
// ─────────────────────────────────────────────────────────────────────────────

app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Freelance Proposal API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// API routes  (general rate limiter applied to all /api/* endpoints)
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api', apiRateLimiter);

app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/jobs',      jobRoutes);
app.use('/api/proposals', proposalRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 404 — Catch-all for unmatched routes
// ─────────────────────────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler
// Must have exactly 4 parameters for Express to recognise it as error middleware.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Operational errors (AppError) → return their status + message
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Prisma unique constraint violation (P2002)
  if ((err as NodeJS.ErrnoException).message?.includes('Unique constraint')) {
    return res.status(409).json({
      status: 'error',
      message: 'A record with these details already exists',
    });
  }

  // Unknown / programming errors — log in full, hide internals from client
  console.error('[UNHANDLED ERROR]', err);

  res.status(500).json({
    status: 'error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : err.message,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV ?? 'development'}`);
      console.log('');
      console.log('  Routes:');
      console.log('    GET    /');
      console.log('    GET    /health');
      console.log('    POST   /api/auth/register');
      console.log('    POST   /api/auth/login');
      console.log('    GET    /api/users/profile  [auth]');
      console.log('    PUT    /api/users/profile  [auth]');
      console.log('    POST   /api/proposals/generate  [auth+rate-limit]');
      console.log('    GET    /api/proposals            [auth]');
      console.log('    GET    /api/proposals/:id        [auth]');
    });
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await closeRabbitMQ();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received. Shutting down...');
  await closeRabbitMQ();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

bootstrap();
