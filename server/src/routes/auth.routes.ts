import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';

const router = Router();

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Simple email format check — avoids pulling in a validation library
 * for what is genuinely a lightweight constraint.
 */
const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const signToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError(500, 'JWT_SECRET is not configured');
  return jwt.sign({ userId }, secret, { expiresIn: JWT_EXPIRES_IN });
};

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────

router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    // ── Validation ──
    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    if (!isValidEmail(email)) {
      throw new AppError(400, 'Please provide a valid email address');
    }

    if (password.length < 8) {
      throw new AppError(400, 'Password must be at least 8 characters long');
    }

    // ── Check uniqueness ──
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      throw new AppError(409, 'An account with this email already exists');
    }

    // ── Hash & persist ──
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    const token = signToken(user.id);

    res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      data: { user, token },
    });
  })
);

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    // ── Validation ──
    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    // ── Look up user ──
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Use a constant-time comparison even on "user not found" to prevent
    // timing attacks that would reveal whether an email is registered.
    const dummyHash = '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXX';
    const passwordHash = user?.passwordHash ?? dummyHash;

    const isMatch = await bcrypt.compare(password, passwordHash);

    if (!user || !isMatch) {
      // Return the same message for both cases to avoid user enumeration
      throw new AppError(401, 'Invalid email or password');
    }

    const token = signToken(user.id);

    res.json({
      status: 'success',
      message: 'Logged in successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  })
);

export default router;
