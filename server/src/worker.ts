/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         Proposal Generation Worker                       ║
 * ║                                                                           ║
 * ║  This is a STANDALONE process — it does NOT import Express.               ║
 * ║  Run it separately:  npx ts-node src/worker.ts                           ║
 * ║                                                                           ║
 * ║  Responsibilities:                                                        ║
 * ║  1. Connect to RabbitMQ and consume the proposal_jobs queue.             ║
 * ║  2. Fetch the user's portfolioText from Postgres via Prisma.             ║
 * ║  3. Call OpenAI gpt-4o-mini to draft the proposal.                       ║
 * ║  4. Update the Proposal record → COMPLETED (or FAILED on error).         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import dotenv from 'dotenv';
dotenv.config(); // Must be the very first side-effect

import OpenAI from 'openai';
import { ConsumeMessage } from 'amqplib';

import { prisma } from './lib/prisma';
import { connectWithRetry, closeRabbitMQ, PROPOSAL_QUEUE } from './config/rabbitmq';
import { ProposalJobMessage } from './utils/publisher';

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI client
// ─────────────────────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Timeout after 60 s — prevents a hung request from blocking the consumer slot.
  timeout: 60_000,
  maxRetries: 2,
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt construction
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are an expert freelance proposal writer with 10+ years of experience winning high-value contracts on platforms like Upwork, Toptal, and Freelancer.

Your task is to write a compelling, personalised freelance proposal based on:
  - The CLIENT'S JOB DESCRIPTION provided by the user.
  - The FREELANCER'S PORTFOLIO provided by the user.

Guidelines:
  • Start with a strong opening line that directly addresses the client's core problem — never a generic greeting.
  • Demonstrate genuine understanding of the project requirements in the first paragraph.
  • Highlight 2-3 directly relevant experiences or achievements from the portfolio that prove you can deliver.
  • Briefly outline your proposed approach or methodology.
  • Include a clear, confidence-inspiring closing with a specific call to action.
  • Keep the tone professional yet conversational — authoritative, not salesy.
  • Length: 250–400 words. Concise and impactful.
  • Do NOT include a subject line, salutation, or signature block — output only the proposal body.`;

function buildUserPrompt(jobDescription: string, portfolioText: string): string {
  return `\
CLIENT'S JOB DESCRIPTION:
${jobDescription}

---

FREELANCER'S PORTFOLIO / EXPERIENCE:
${portfolioText}

---

Write the freelance proposal now.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core message handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleMessage(msg: ConsumeMessage): Promise<void> {
  // ── 1. Parse ──────────────────────────────────────────────────────────────
  let job: ProposalJobMessage;
  try {
    job = JSON.parse(msg.content.toString()) as ProposalJobMessage;
  } catch {
    console.error('[Worker] Failed to parse message — discarding (dead-letter if configured)');
    return; // channel.nack is called in the wrapper
  }

  const { proposalId, userId, jobDescription, jobTitle } = job;

  console.log(`[Worker] Processing proposal ${proposalId} for user ${userId}`);
  console.log(`[Worker] Job: "${jobTitle ?? 'Untitled'}"`);

  // ── 2. Fetch freelancer's portfolio ───────────────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { portfolioText: true, email: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found — cannot generate proposal`);
  }

  const portfolioText = user.portfolioText?.trim();

  if (!portfolioText) {
    throw new Error(
      `User ${userId} has no portfolioText — proposal ${proposalId} cannot be generated`
    );
  }

  // ── 3. Call OpenAI ────────────────────────────────────────────────────────
  console.log(`[Worker] Calling OpenAI for proposal ${proposalId}…`);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role:    'system',
        content: SYSTEM_PROMPT,
      },
      {
        role:    'user',
        content: buildUserPrompt(jobDescription, portfolioText),
      },
    ],
    temperature:  0.72,   // creative but consistent
    max_tokens:   700,    // ~400 words with buffer
    // n: 1 (default) — one completion
  });

  const generatedText = completion.choices[0]?.message?.content?.trim();

  if (!generatedText) {
    throw new Error(`OpenAI returned an empty response for proposal ${proposalId}`);
  }

  const tokensUsed = completion.usage?.total_tokens ?? 0;
  console.log(`[Worker] OpenAI responded (${tokensUsed} tokens) for proposal ${proposalId}`);

  // ── 4. Persist to database ────────────────────────────────────────────────
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status:        'COMPLETED',
      generatedText,
    },
  });

  console.log(`[Worker] ✅ Proposal ${proposalId} completed successfully`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Message wrapper — handles ack / nack and error recording
// ─────────────────────────────────────────────────────────────────────────────

async function processMessage(
  msg: ConsumeMessage | null,
  channel: Awaited<ReturnType<typeof connectWithRetry>>
): Promise<void> {
  if (!msg) return; // Consumer was cancelled (null delivery)

  let proposalId: string | undefined;

  try {
    // Extract proposalId early for the error path (may fail if JSON is malformed)
    proposalId = (JSON.parse(msg.content.toString()) as Partial<ProposalJobMessage>).proposalId;
  } catch {
    // nack without requeue — malformed messages cannot be retried meaningfully
    channel.nack(msg, false, false);
    console.error('[Worker] Malformed JSON — message discarded');
    return;
  }

  try {
    await handleMessage(msg);

    // Ack only after everything (DB write) has succeeded
    channel.ack(msg);
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[Worker] ❌ Error processing proposal ${proposalId ?? 'unknown'}:`, errorMessage);

    // Mark the proposal as FAILED so the user knows (rather than hanging in PENDING)
    if (proposalId) {
      try {
        await prisma.proposal.update({
          where: { id: proposalId },
          data:  { status: 'FAILED' },
        });
        console.log(`[Worker] Proposal ${proposalId} marked as FAILED`);
      } catch (dbErr) {
        console.error('[Worker] Failed to update proposal status to FAILED:', (dbErr as Error).message);
      }
    }

    // nack without requeue — prevents poison messages from looping forever.
    // If you want retries, configure a Dead Letter Exchange (DLX) in RabbitMQ
    // with a TTL and a retry count header check.
    channel.nack(msg, false, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function startWorker(): Promise<void> {
  console.log('🔧 Proposal generation worker starting…');
  console.log(`   Queue    : ${PROPOSAL_QUEUE}`);
  console.log(`   Model    : gpt-4o-mini`);
  console.log(`   Prefetch : 1 (sequential processing)`);
  console.log('');

  // Validate required env vars before connecting to anything
  if (!process.env.OPENAI_API_KEY) {
    console.error('[Worker] FATAL: OPENAI_API_KEY environment variable is not set');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('[Worker] FATAL: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Connect to Prisma
  await prisma.$connect();
  console.log('✅ Database connected');

  // Connect to RabbitMQ (with exponential back-off retry)
  const channel = await connectWithRetry();

  // Begin consuming — prefetch(1) is set inside connectWithRetry → connect()
  await channel.consume(
    PROPOSAL_QUEUE,
    (msg) => processMessage(msg, channel),
    { noAck: false } // Manual acknowledgement — we ack after successful DB write
  );

  console.log(`🚀 Worker listening on queue "${PROPOSAL_QUEUE}"`);
  console.log('   Press Ctrl+C to stop\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Worker] ${signal} received — shutting down gracefully…`);
  try {
    await closeRabbitMQ();
    await prisma.$disconnect();
    console.log('[Worker] Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT',  () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Catch unhandled promise rejections — log and keep the worker alive
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Worker] Unhandled promise rejection:', reason);
});

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

startWorker().catch((err: unknown) => {
  console.error('[Worker] Fatal startup error:', err);
  process.exit(1);
});
