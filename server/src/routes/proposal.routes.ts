import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { proposalRateLimiter } from '../middleware/rateLimiter.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { publishProposalJob } from '../utils/publisher';

const router = Router();

// All proposal routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/proposals/generate
//
// Pipeline:
//   1. Validate request body.
//   2. Create a JobPosting record from the submitted job data.
//   3. Create a Proposal with status PENDING linked to that JobPosting.
//   4. Publish a ProposalJobMessage to RabbitMQ.
//   5. Return 202 Accepted immediately — generation is asynchronous.
//
// Rate-limited: 10 calls / 24 h per authenticated userId.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/generate',
  proposalRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;

    const {
      jobTitle,
      jobDescription,
      jobSource,
    } = req.body as {
      jobTitle?:       string;
      jobDescription?: string;
      jobSource?:      string;
    };

    // ── Validation ────────────────────────────────────────────────────────────
    if (!jobDescription || typeof jobDescription !== 'string') {
      throw new AppError(400, 'jobDescription is required');
    }

    const trimmedDescription = jobDescription.trim();

    if (trimmedDescription.length < 50) {
      throw new AppError(
        400,
        'jobDescription must be at least 50 characters so the AI can generate a meaningful proposal'
      );
    }

    if (trimmedDescription.length > 20_000) {
      throw new AppError(400, 'jobDescription must not exceed 20,000 characters');
    }

    // ── Check the user has a portfolio (better early error than silent bad output) ──
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { portfolioText: true },
    });

    if (!user) {
      throw new AppError(404, 'User account not found');
    }

    if (!user.portfolioText || user.portfolioText.trim().length === 0) {
      throw new AppError(
        422,
        'Your portfolio is empty. Please update your profile with a portfolioText before generating proposals.'
      );
    }

    // ── Create JobPosting ─────────────────────────────────────────────────────
    // A new JobPosting is created per submission so every proposal is traceable
    // back to the exact job description that was processed.
    const jobPosting = await prisma.jobPosting.create({
      data: {
        title:          (jobTitle?.trim() || 'Untitled Posting'),
        description:    trimmedDescription,
        source:         (jobSource?.trim() || 'manual'),
        requiredSkills: [], // Skills will be extracted by the worker in the next sprint
      },
    });

    // ── Create Proposal (PENDING) ─────────────────────────────────────────────
    const proposal = await prisma.proposal.create({
      data: {
        userId,
        jobPostingId: jobPosting.id,
        status:       'PENDING',
      },
    });

    // ── Publish to RabbitMQ ───────────────────────────────────────────────────
    const enqueued = await publishProposalJob({
      proposalId:     proposal.id,
      userId,
      jobDescription: trimmedDescription,
      jobTitle:       jobPosting.title,
    });

    if (!enqueued) {
      // The message failed to enqueue. Mark proposal FAILED so the user isn't
      // stuck polling a PENDING record that will never be processed.
      await prisma.proposal.update({
        where: { id: proposal.id },
        data:  { status: 'FAILED' },
      });
      throw new AppError(503, 'Queue unavailable. Please try again in a moment.');
    }

    // ── 202 Accepted ──────────────────────────────────────────────────────────
    res.status(202).json({
      status:  'accepted',
      message: 'Proposal generation has been queued. Poll GET /api/proposals/:id for the result.',
      data: {
        proposalId: proposal.id,
        status:     'PENDING',
        links: {
          status:  `/api/proposals/${proposal.id}`,
          listing: '/api/proposals',
        },
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/proposals
// List all proposals for the authenticated user (summary view).
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;

    const proposals = await prisma.proposal.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        status:    true,
        createdAt: true,
        jobPosting: {
          select: { title: true, source: true },
        },
      },
    });

    res.json({
      status: 'success',
      data:   { proposals, total: proposals.length },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/proposals/:id
// Fetch a single proposal with full generatedText.
// Users can only access their own proposals (enforced by the userId filter).
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id     = req.params['id'] as string;
    const userId   = req.userId!;

    const proposal = await prisma.proposal.findFirst({
      where: { id, userId },
      select: {
        id:            true,
        status:        true,
        generatedText: true,
        createdAt:     true,
        jobPosting: {
          select: {
            title:          true,
            description:    true,
            source:         true,
            requiredSkills: true,
            createdAt:      true,
          },
        },
      },
    });

    if (!proposal) {
      throw new AppError(404, 'Proposal not found or you do not have access to it');
    }

    res.json({
      status: 'success',
      data:   { proposal },
    });
  })
);

export default router;
