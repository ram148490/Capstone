import { Request, Response, NextFunction } from 'express';
import { verifyJwtToken } from '../db';

const DEMO_USER_ID = 'usr-demo-manager-1';

/** Express request augmented with the resolved user identity. */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Soft auth: resolves the caller from a Bearer token when present, otherwise
 * falls back to the demo manager so the app is usable without signing in.
 */
export const authMiddleware = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.userId = DEMO_USER_ID;
    return next();
  }

  const decoded = verifyJwtToken(authHeader.split(' ')[1]);
  if (!decoded) {
    req.userId = DEMO_USER_ID;
    return next();
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;
  next();
};

/** Hard auth: rejects the request with 401 unless a valid Bearer token is present. */
export const strictAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ success: false, error: 'Authentication required. Please log in.' });
  }

  const decoded = verifyJwtToken(authHeader.split(' ')[1]);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session. Please log in again.',
    });
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;
  next();
};

export { DEMO_USER_ID };
