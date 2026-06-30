import amqplib, { ChannelModel, Channel, Options } from 'amqplib';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const PROPOSAL_QUEUE = 'proposal_jobs';

const RABBITMQ_URL  = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

// Reconnection back-off: 1 s, 2 s, 4 s … capped at 30 s
const MAX_RECONNECT_DELAY_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Singleton state (shared within one process — publisher OR consumer, not both)
// ─────────────────────────────────────────────────────────────────────────────

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let reconnectAttempt = 0;
let isConnecting = false;

// ─────────────────────────────────────────────────────────────────────────────
// Internal: establish connection + channel, assert queue
// ─────────────────────────────────────────────────────────────────────────────

async function connect(): Promise<Channel> {
  const conn = await amqplib.connect(RABBITMQ_URL as Options.Connect) as ChannelModel;
  const ch   = await conn.createChannel();

  // Durable queue — survives broker restarts.
  // Messages marked persistent: true will also survive.
  await ch.assertQueue(PROPOSAL_QUEUE, { durable: true });

  // Process one message at a time (worker only; harmless for publisher).
  await ch.prefetch(1);

  // Tear down cached refs when the connection drops so the next
  // call to getChannel() triggers a fresh reconnect.
  conn.on('error', (err: Error) => {
    console.error('[RabbitMQ] Connection error:', err.message);
    connection = null;
    channel    = null;
  });

  conn.on('close', () => {
    console.warn('[RabbitMQ] Connection closed');
    connection = null;
    channel    = null;
  });

  connection       = conn;
  channel          = ch;
  reconnectAttempt = 0;
  return ch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: get (or lazily create) the shared channel
// ─────────────────────────────────────────────────────────────────────────────

export async function getChannel(): Promise<Channel> {
  if (channel) return channel;

  if (isConnecting) {
    // Back off and retry; avoids stampede during startup.
    await new Promise((r) => setTimeout(r, 500));
    return getChannel();
  }

  isConnecting = true;
  try {
    const ch = await connect();
    console.log(`✅ RabbitMQ connected (queue: "${PROPOSAL_QUEUE}")`);
    return ch;
  } catch (err) {
    console.error('[RabbitMQ] Failed to connect:', (err as Error).message);
    throw err;
  } finally {
    isConnecting = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: connect with exponential back-off retry loop
// Designed for the worker process that must stay up indefinitely.
// ─────────────────────────────────────────────────────────────────────────────

export async function connectWithRetry(): Promise<Channel> {
  while (true) {
    try {
      const ch = await connect();
      console.log(`✅ RabbitMQ connected (attempt ${reconnectAttempt + 1})`);
      reconnectAttempt = 0;
      return ch;
    } catch (err) {
      reconnectAttempt++;
      const delay = Math.min(1000 * 2 ** (reconnectAttempt - 1), MAX_RECONNECT_DELAY_MS);
      console.error(
        `[RabbitMQ] Connection failed (attempt ${reconnectAttempt}). Retrying in ${delay / 1000}s…`,
        (err as Error).message
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: graceful close
// ─────────────────────────────────────────────────────────────────────────────

export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel)    await channel.close();
    if (connection) await (connection as ChannelModel).close();
    channel    = null;
    connection = null;
    console.log('🛑 RabbitMQ disconnected');
  } catch (err) {
    console.error('[RabbitMQ] Error during close:', (err as Error).message);
  }
}
