import { Request, Response, NextFunction } from 'express';
import { verifyJwtToken } from '../db';

const DEMO_USER_ID = 'usr-demo-manager-1';

/** Express request augmented with the resolved user identity. */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Soft auth: an anonymous request (no Authorization header at all) is served as
 * the shared demo manager so the app is usable without signing in. But a request
 * that DOES present a Bearer token which is invalid or expired is rejected with
 * 401 rather than silently downgraded to the demo account — otherwise a signed-in
 * user whose token lapsed would keep working and quietly write their real roster
 * / POS data into the globally-readable demo workspace.
 */
export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.userId = DEMO_USER_ID;
    return next();
  }

  const decoded = verifyJwtToken(authHeader.split(' ')[1]);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Your session has expired or is invalid. Please sign in again.',
    });
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
