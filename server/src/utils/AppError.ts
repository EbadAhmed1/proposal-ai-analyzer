/**
 * Centralised HTTP error class.
 * Throw this anywhere (route handlers, services) and the global error handler
 * will pick up the status code and message automatically.
 *
 * Example:
 *   throw new AppError(404, 'User not found');
 *   throw new AppError(401, 'Invalid credentials');
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
