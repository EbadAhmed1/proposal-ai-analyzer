import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler so that any thrown error or rejected promise
 * is forwarded to Express's next() function (and thus to the global error handler)
 * instead of causing an unhandled promise rejection.
 *
 * Usage:
 *   router.get('/example', asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
