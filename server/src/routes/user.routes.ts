import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';

const router = Router();

// All user routes require a valid JWT
router.use(authenticate);

// ─────────────────────────────────────────────
// GET /api/users/profile
// Returns the authenticated user's profile (never exposes passwordHash).
// ─────────────────────────────────────────────

router.get(
  '/profile',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        portfolioText: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    res.json({
      status: 'success',
      data: { user },
    });
  })
);

// ─────────────────────────────────────────────
// PUT /api/users/profile
// Allows users to update their portfolioText.
// Additional updatable fields can be added here in future sprints.
// ─────────────────────────────────────────────

router.put(
  '/profile',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { portfolioText } = req.body as { portfolioText?: unknown };

    // ── Validation ──
    if (portfolioText === undefined) {
      throw new AppError(400, 'No updatable fields provided. Send at least portfolioText.');
    }

    if (typeof portfolioText !== 'string') {
      throw new AppError(400, 'portfolioText must be a string');
    }

    if (portfolioText.length > 10_000) {
      throw new AppError(400, 'portfolioText cannot exceed 10,000 characters');
    }

    // ── Ensure user still exists ──
    const exists = await prisma.user.findUnique({ where: { id: userId } });
    if (!exists) {
      throw new AppError(404, 'User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { portfolioText: portfolioText.trim() },
      select: {
        id: true,
        email: true,
        portfolioText: true,
        createdAt: true,
      },
    });

    res.json({
      status: 'success',
      message: 'Profile updated successfully',
      data: { user: updatedUser },
    });
  })
);

export default router;
