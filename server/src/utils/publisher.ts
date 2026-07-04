import { getChannel, PROPOSAL_QUEUE } from '../config/rabbitmq';

// ─────────────────────────────────────────────────────────────────────────────
// Message schema published to the proposal_jobs queue
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalJobMessage {
  proposalId:     string;
  userId:         string;
  jobDescription: string;
  jobTitle:       string;
  refinementInstruction?: string;
  previousDraft?:         string;
}

// ─────────────────────────────────────────────────────────────────────────────
// publishProposalJob
//
// Serialises the message as JSON and sends it to the durable proposal_jobs
// queue with persistent delivery mode so it survives a broker restart.
//
// Returns: true if the message was enqueued, false if the channel's internal
// buffer is full (back-pressure — caller may want to retry).
// ─────────────────────────────────────────────────────────────────────────────

export async function publishProposalJob(
  message: ProposalJobMessage
): Promise<boolean> {
  const channel = await getChannel();

  const buffer = Buffer.from(JSON.stringify(message));

  const enqueued = channel.sendToQueue(PROPOSAL_QUEUE, buffer, {
    persistent:  true,            // message survives broker restart
    contentType: 'application/json',
    timestamp:   Date.now(),
    appId:       'freelance-api', // useful for diagnostics in RabbitMQ Management UI
  });

  if (!enqueued) {
    console.warn('[Publisher] Channel write buffer full — message may be dropped');
  }

  return enqueued;
}
