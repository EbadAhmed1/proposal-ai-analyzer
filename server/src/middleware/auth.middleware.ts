import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Auth middleware — verifies the Bearer JWT in the Authorization header.
 *
 * On success:  populates req.userId and calls next().
 * On failure:  throws AppError(401) which propagates to the global error handler.
 *
 * Expected header format:
 *   Authorization: Bearer <token>
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'No token provided. Authorization header must be: Bearer <token>');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Malformed token');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Config error — treat as server fault, not client fault
      throw new AppError(500, 'JWT_SECRET is not configured on the server');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;

    if (!decoded.userId) {
      throw new AppError(401, 'Invalid token payload');
    }

    req.userId = decoded.userId;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }

    // jsonwebtoken errors (TokenExpiredError, JsonWebTokenError, etc.)
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Token has expired. Please log in again.'));
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AppError(401, 'Invalid token. Please log in again.'));
    }

    next(new AppError(401, 'Authentication failed'));
  }
};
