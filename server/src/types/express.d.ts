// Augment the Express Request interface globally so that every route handler
// can access `req.userId` after the auth middleware populates it.

declare namespace Express {
  interface Request {
    userId?: string;
  }
}
