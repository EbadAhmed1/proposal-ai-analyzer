/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         Proposal Generation Worker                       ║
 * ║                                                                           ║
 * ║  Can run as:                                                              ║
 * ║    1. STANDALONE process: npx ts-node src/worker.ts                      ║
 * ║    2. INLINE with Express: set RUN_WORKER=true env var                   ║
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

import amqplib, { Channel, ChannelModel, Options } from 'amqplib';
import OpenAI from 'openai';
import { ConsumeMessage } from 'amqplib';

import { prisma } from './lib/prisma';
import { PROPOSAL_QUEUE } from './config/rabbitmq';
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

const REFINEMENT_SYSTEM_PROMPT = `\
You are an expert freelance proposal writer with 10+ years of experience winning high-value contracts on platforms like Upwork, Toptal, and Freelancer.

Your task is to refine and rewrite a previously generated freelance proposal based on the freelancer's specific feedback or request.

Guidelines:
  • Keep the core context (client requirements and freelancer strengths) but adjust the tone, style, focus, or length according to the feedback.
  • Retain any good aspects of the previous draft while fully incorporating the new instruction.
  • Keep the tone professional yet conversational — authoritative, not salesy.
  • Length: 250–400 words. Concise and impactful.
  • Do NOT include a subject line, salutation, or signature block — output only the proposal body.`;

function buildRefinementUserPrompt(
  jobDescription: string,
  portfolioText: string,
  previousDraft: string,
  instruction: string
): string {
  return `\
CLIENT'S JOB DESCRIPTION:
${jobDescription}

---

FREELANCER'S PORTFOLIO / EXPERIENCE:
${portfolioText}

---

PREVIOUS PROPOSAL DRAFT:
${previousDraft}

---

REFINEMENT INSTRUCTION / REQUEST FROM FREELANCER:
"${instruction}"

---

Revise the proposal now based on the instructions above.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedicated consumer connection (separate from the publisher singleton)
//
// This avoids conflicts when the worker runs inline alongside the Express
// server, which uses its own singleton connection via getChannel().
// ─────────────────────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
const MAX_RECONNECT_DELAY_MS = 30_000;

let workerConnection: ChannelModel | null = null;

async function createConsumerChannel(): Promise<Channel> {
  let attempt = 0;
  while (true) {
    try {
      const conn = await amqplib.connect(RABBITMQ_URL as Options.Connect) as ChannelModel;
      const ch = await conn.createChannel();
      await ch.assertQueue(PROPOSAL_QUEUE, { durable: true });
      await ch.prefetch(1);

      conn.on('error', (err: Error) => {
        console.error('[Worker] Consumer connection error:', err.message);
        workerConnection = null;
      });

      conn.on('close', () => {
        console.warn('[Worker] Consumer connection closed');
        workerConnection = null;
      });

      workerConnection = conn;
      console.log(`✅ Worker RabbitMQ consumer connected (attempt ${attempt + 1})`);
      return ch;
    } catch (err) {
      attempt++;
      const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
      console.error(
        `[Worker] Consumer connection failed (attempt ${attempt}). Retrying in ${delay / 1000}s…`,
        (err as Error).message
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
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

  const { proposalId, userId, jobDescription, jobTitle, refinementInstruction, previousDraft } = job;

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

  const messages = refinementInstruction && previousDraft
    ? [
        {
          role:    'system' as const,
          content: REFINEMENT_SYSTEM_PROMPT,
        },
        {
          role:    'user' as const,
          content: buildRefinementUserPrompt(jobDescription, portfolioText, previousDraft, refinementInstruction),
        },
      ]
    : [
        {
          role:    'system' as const,
          content: SYSTEM_PROMPT,
        },
        {
          role:    'user' as const,
          content: buildUserPrompt(jobDescription, portfolioText),
        },
      ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature:  0.72,   // creative but consistent
    max_tokens:   700,    // ~400 words with buffer
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
  channel: Channel
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
//
// @param inline — true when running inside the Express server process.
//                 Skips prisma.$connect() (already done) and avoids
//                 process.exit() which would kill the server.
// ─────────────────────────────────────────────────────────────────────────────

export async function startWorker(inline = false): Promise<void> {
  console.log('🔧 Proposal generation worker starting…');
  console.log(`   Queue    : ${PROPOSAL_QUEUE}`);
  console.log(`   Model    : gpt-4o-mini`);
  console.log(`   Prefetch : 1 (sequential processing)`);
  console.log(`   Mode     : ${inline ? 'inline (same process as Express)' : 'standalone'}`);
  console.log('');

  // Validate required env vars before connecting to anything
  if (!process.env.OPENAI_API_KEY) {
    const msg = 'OPENAI_API_KEY environment variable is not set';
    if (inline) { console.error(`[Worker] ERROR: ${msg}`); return; }
    console.error(`[Worker] FATAL: ${msg}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    const msg = 'DATABASE_URL environment variable is not set';
    if (inline) { console.error(`[Worker] ERROR: ${msg}`); return; }
    console.error(`[Worker] FATAL: ${msg}`);
    process.exit(1);
  }

  // Connect to Prisma (skip if inline — the server already called $connect)
  if (!inline) {
    await prisma.$connect();
    console.log('✅ Database connected');
  }

  // Create a DEDICATED consumer connection (separate from publisher singleton)
  const channel = await createConsumerChannel();

  // Begin consuming — prefetch(1) is set inside createConsumerChannel()
  await channel.consume(
    PROPOSAL_QUEUE,
    (msg) => processMessage(msg, channel),
    { noAck: false } // Manual acknowledgement — we ack after successful DB write
  );

  console.log(`🚀 Worker listening on queue "${PROPOSAL_QUEUE}"`);
  if (!inline) {
    console.log('   Press Ctrl+C to stop\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown (only registered when running standalone)
// ─────────────────────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Worker] ${signal} received — shutting down gracefully…`);
  try {
    if (workerConnection) {
      await workerConnection.close();
      workerConnection = null;
    }
    await prisma.$disconnect();
    console.log('[Worker] Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — only runs when executed directly (not when imported)
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Catch unhandled promise rejections — log and keep the worker alive
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[Worker] Unhandled promise rejection:', reason);
  });

  startWorker(false).catch((err: unknown) => {
    console.error('[Worker] Fatal startup error:', err);
    process.exit(1);
  });
}
